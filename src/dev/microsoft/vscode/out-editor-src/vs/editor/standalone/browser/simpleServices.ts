/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as strings from 'vs/base/common/strings';
import * as dom from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { Emitter, Event } from 'vs/base/common/event';
import { Keybinding, ResolvedKeybinding, SimpleKeybinding, createKeybinding } from 'vs/base/common/keyCodes';
import { IDisposable, IReference, ImmortalReference, toDisposable, DisposableStore, Disposable } from 'vs/base/common/lifecycle';
import { OS, isLinux, isMacintosh } from 'vs/base/common/platform';
import Severity from 'vs/base/common/severity';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor, IDiffEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { IBulkEditOptions, IBulkEditResult, IBulkEditService, ResourceEdit, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { isDiffEditorConfigurationKey, isEditorConfigurationKey } from 'vs/editor/common/config/commonEditorConfig';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { IPosition, Position as Pos } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IEditor } from 'vs/editor/common/editorCommon';
import { IIdentifiedSingleEditOperation, ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IResolvedTextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { ITextResourceConfigurationService, ITextResourcePropertiesService, ITextResourceConfigurationChangeEvent } from 'vs/editor/common/services/textResourceConfigurationService';
import { CommandsRegistry, ICommandEvent, ICommandHandler, ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationChangeEvent, IConfigurationOverrides, IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { Configuration, ConfigurationModel, DefaultConfigurationModel, ConfigurationChangeEvent } from 'vs/platform/configuration/common/configurationModels';
import { IContextKeyService, ContextKeyExpression } from 'vs/platform/contextkey/common/contextkey';
import { IConfirmation, IConfirmationResult, IDialogOptions, IDialogService, IShowResult } from 'vs/platform/dialogs/common/dialogs';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { AbstractKeybindingService } from 'vs/platform/keybinding/common/abstractKeybindingService';
import { IKeybindingEvent, IKeyboardEvent, KeybindingSource } from 'vs/platform/keybinding/common/keybinding';
import { KeybindingResolver } from 'vs/platform/keybinding/common/keybindingResolver';
import { IKeybindingItem, KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ResolvedKeybindingItem } from 'vs/platform/keybinding/common/resolvedKeybindingItem';
import { USLayoutResolvedKeybinding } from 'vs/platform/keybinding/common/usLayoutResolvedKeybinding';
import { ILabelService } from 'vs/platform/label/common/label';
import { INotification, INotificationHandle, INotificationService, NoOpNotification, IStatusMessageOptions } from 'vs/platform/notification/common/notification';
import { IProgressRunner, IEditorProgressService } from 'vs/platform/progress/common/progress';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspace, IWorkspaceContextService, WorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { SimpleServicesNLS } from 'vs/editor/common/standaloneStrings';
import { ClassifiedEvent, StrictPropertyCheck, GDPRClassification } from 'vs/platform/telemetry/common/gdprTypings';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { ILogService } from 'vs/platform/log/common/log';

export class SimpleModel implements IResolvedTextEditorModel {

	private readonly model: ITextModel;
	private readonly _onWillDispose: Emitter<void>;

	constructor(model: ITextModel) {
		this.model = model;
		this._onWillDispose = new Emitter<void>();
	}

	public get textEditorModel(): ITextModel {
		return this.model;
	}

	private disposed = false;
	public dispose(): void {
		this.disposed = true;

		this._onWillDispose.fire();
	}
}

function withTypedEditor<T>(widget: IEditor, codeEditorCallback: (editor: ICodeEditor) => T, diffEditorCallback: (editor: IDiffEditor) => T): T {
	if (isCodeEditor(widget)) {
		// Single Editor
		return codeEditorCallback(<ICodeEditor>widget);
	} else {
		// Diff Editor
		return diffEditorCallback(<IDiffEditor>widget);
	}
}

export class SimpleEditorModelResolverService implements ITextModelService {
	public _serviceBrand: undefined;

	private editor?: IEditor;

	constructor(
		@IModelService private readonly modelService: IModelService
	) { }

	public setEditor(editor: IEditor): void {
		this.editor = editor;
	}

	public createModelReference(resource: URI): Promise<IReference<IResolvedTextEditorModel>> {
		let model: ITextModel | null = null;
		if (this.editor) {
			model = withTypedEditor(this.editor,
				(editor) => this.findModel(editor, resource),
				(diffEditor) => this.findModel(diffEditor.getOriginalEditor(), resource) || this.findModel(diffEditor.getModifiedEditor(), resource)
			);
		}

		if (!model) {
			return Promise.reject(new Error(`Model not found`));
		}

		return Promise.resolve(new ImmortalReference(new SimpleModel(model)));
	}

	private findModel(editor: ICodeEditor, resource: URI): ITextModel | null {
		let model = this.modelService.getModel(resource);
		if (model && model.uri.toString() !== resource.toString()) {
			return null;
		}

		return model;
	}
}

export class SimpleEditorProgressService implements IEditorProgressService {
	declare readonly _serviceBrand: undefined;

	private static NULL_PROGRESS_RUNNER: IProgressRunner = {
		done: () => { },
		total: () => { },
		worked: () => { }
	};

	show(infinite: true, delay?: number): IProgressRunner;
	show(total: number, delay?: number): IProgressRunner;
	show(): IProgressRunner {
		return SimpleEditorProgressService.NULL_PROGRESS_RUNNER;
	}

	async showWhile(promise: Promise<any>, delay?: number): Promise<void> {
		await promise;
	}
}

export class SimpleDialogService implements IDialogService {

	public _serviceBrand: undefined;

	public confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
		return this.doConfirm(confirmation).then(confirmed => {
			return {
				confirmed,
				checkboxChecked: false // unsupported
			} as IConfirmationResult;
		});
	}

	private doConfirm(confirmation: IConfirmation): Promise<boolean> {
		let messageText = confirmation.message;
		if (confirmation.detail) {
			messageText = messageText + '\n\n' + confirmation.detail;
		}

		return Promise.resolve(window.confirm(messageText));
	}

	public show(severity: Severity, message: string, buttons: string[], options?: IDialogOptions): Promise<IShowResult> {
		return Promise.resolve({ choice: 0 });
	}
}

export class SimpleNotificationService implements INotificationService {

	public _serviceBrand: undefined;

	private static readonly NO_OP: INotificationHandle = new NoOpNotification();

	public info(message: string): INotificationHandle {
		return this.notify({ severity: Severity.Info, message });
	}

	public warn(message: string): INotificationHandle {
		return this.notify({ severity: Severity.Warning, message });
	}

	public error(error: string | Error): INotificationHandle {
		return this.notify({ severity: Severity.Error, message: error });
	}

	public notify(notification: INotification): INotificationHandle {
		switch (notification.severity) {
			case Severity.Error:
				console.error(notification.message);
				break;
			case Severity.Warning:
				console.warn(notification.message);
				break;
			default:
				console.log(notification.message);
				break;
		}

		return SimpleNotificationService.NO_OP;
	}

	public status(message: string | Error, options?: IStatusMessageOptions): IDisposable {
		return Disposable.None;
	}
}

export class StandaloneCommandService implements ICommandService {
	declare readonly _serviceBrand: undefined;

	private readonly _instantiationService: IInstantiationService;

	private readonly _onWillExecuteCommand = new Emitter<ICommandEvent>();
	private readonly _onDidExecuteCommand = new Emitter<ICommandEvent>();
	public readonly onDidExecuteCommand: Event<ICommandEvent> = this._onDidExecuteCommand.event;

	constructor(instantiationService: IInstantiationService) {
		this._instantiationService = instantiationService;
	}

	public executeCommand<T>(id: string, ...args: any[]): Promise<T> {
		const command = CommandsRegistry.getCommand(id);
		if (!command) {
			return Promise.reject(new Error(`command '${id}' not found`));
		}

		try {
			this._onWillExecuteCommand.fire({ commandId: id, args });
			const result = this._instantiationService.invokeFunction.apply(this._instantiationService, [command.handler, ...args]) as T;

			this._onDidExecuteCommand.fire({ commandId: id, args });
			return Promise.resolve(result);
		} catch (err) {
			return Promise.reject(err);
		}
	}
}

export class StandaloneKeybindingService extends AbstractKeybindingService {
	private _cachedResolver: KeybindingResolver | null;
	private readonly _dynamicKeybindings: IKeybindingItem[];

	constructor(
		contextKeyService: IContextKeyService,
		commandService: ICommandService,
		telemetryService: ITelemetryService,
		notificationService: INotificationService,
		logService: ILogService,
		domNode: HTMLElement
	) {
		super(contextKeyService, commandService, telemetryService, notificationService, logService);

		this._cachedResolver = null;
		this._dynamicKeybindings = [];

		// for standard keybindings
		this._register(dom.addDisposableListener(domNode, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const keyEvent = new StandardKeyboardEvent(e);
			const shouldPreventDefault = this._dispatch(keyEvent, keyEvent.target);
			if (shouldPreventDefault) {
				keyEvent.preventDefault();
				keyEvent.stopPropagation();
			}
		}));

		// for single modifier chord keybindings (e.g. shift shift)
		this._register(dom.addDisposableListener(window, dom.EventType.KEY_UP, (e: KeyboardEvent) => {
			const keyEvent = new StandardKeyboardEvent(e);
			const shouldPreventDefault = this._singleModifierDispatch(keyEvent, keyEvent.target);
			if (shouldPreventDefault) {
				keyEvent.preventDefault();
			}
		}));
	}

	public addDynamicKeybinding(commandId: string, _keybinding: number, handler: ICommandHandler, when: ContextKeyExpression | undefined): IDisposable {
		const keybinding = createKeybinding(_keybinding, OS);

		const toDispose = new DisposableStore();

		if (keybinding) {
			this._dynamicKeybindings.push({
				keybinding: keybinding,
				command: commandId,
				when: when,
				weight1: 1000,
				weight2: 0,
				extensionId: null,
				isBuiltinExtension: false
			});

			toDispose.add(toDisposable(() => {
				for (let i = 0; i < this._dynamicKeybindings.length; i++) {
					let kb = this._dynamicKeybindings[i];
					if (kb.command === commandId) {
						this._dynamicKeybindings.splice(i, 1);
						this.updateResolver({ source: KeybindingSource.Default });
						return;
					}
				}
			}));
		}

		toDispose.add(CommandsRegistry.registerCommand(commandId, handler));

		this.updateResolver({ source: KeybindingSource.Default });

		return toDispose;
	}

	private updateResolver(event: IKeybindingEvent): void {
		this._cachedResolver = null;
		this._onDidUpdateKeybindings.fire(event);
	}

	protected _getResolver(): KeybindingResolver {
		if (!this._cachedResolver) {
			const defaults = this._toNormalizedKeybindingItems(KeybindingsRegistry.getDefaultKeybindings(), true);
			const overrides = this._toNormalizedKeybindingItems(this._dynamicKeybindings, false);
			this._cachedResolver = new KeybindingResolver(defaults, overrides, (str) => this._log(str));
		}
		return this._cachedResolver;
	}

	protected _documentHasFocus(): boolean {
		return document.hasFocus();
	}

	private _toNormalizedKeybindingItems(items: IKeybindingItem[], isDefault: boolean): ResolvedKeybindingItem[] {
		let result: ResolvedKeybindingItem[] = [], resultLen = 0;
		for (const item of items) {
			const when = item.when || undefined;
			const keybinding = item.keybinding;

			if (!keybinding) {
				// This might be a removal keybinding item in user settings => accept it
				result[resultLen++] = new ResolvedKeybindingItem(undefined, item.command, item.commandArgs, when, isDefault, null, false);
			} else {
				const resolvedKeybindings = this.resolveKeybinding(keybinding);
				for (const resolvedKeybinding of resolvedKeybindings) {
					result[resultLen++] = new ResolvedKeybindingItem(resolvedKeybinding, item.command, item.commandArgs, when, isDefault, null, false);
				}
			}
		}

		return result;
	}

	public resolveKeybinding(keybinding: Keybinding): ResolvedKeybinding[] {
		return [new USLayoutResolvedKeybinding(keybinding, OS)];
	}

	public resolveKeyboardEvent(keyboardEvent: IKeyboardEvent): ResolvedKeybinding {
		let keybinding = new SimpleKeybinding(
			keyboardEvent.ctrlKey,
			keyboardEvent.shiftKey,
			keyboardEvent.altKey,
			keyboardEvent.metaKey,
			keyboardEvent.keyCode
		).toChord();
		return new USLayoutResolvedKeybinding(keybinding, OS);
	}
}

function isConfigurationOverrides(thing: any): thing is IConfigurationOverrides {
	return thing
		&& typeof thing === 'object'
		&& (!thing.overrideIdentifier || typeof thing.overrideIdentifier === 'string')
		&& (!thing.resource || thing.resource instanceof URI);
}

export class SimpleConfigurationService implements IConfigurationService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConfiguration = new Emitter<IConfigurationChangeEvent>();
	public readonly onDidChangeConfiguration: Event<IConfigurationChangeEvent> = this._onDidChangeConfiguration.event;

	private readonly _configuration: Configuration;

	constructor() {
		this._configuration = new Configuration(new DefaultConfigurationModel(), new ConfigurationModel());
	}

	getValue<T>(): T;
	getValue<T>(section: string): T;
	getValue<T>(overrides: IConfigurationOverrides): T;
	getValue<T>(section: string, overrides: IConfigurationOverrides): T;
	getValue(arg1?: any, arg2?: any): any {
		const section = typeof arg1 === 'string' ? arg1 : undefined;
		const overrides = isConfigurationOverrides(arg1) ? arg1 : isConfigurationOverrides(arg2) ? arg2 : {};
		return this._configuration.getValue(section, overrides, undefined);
	}

	public updateValues(values: [string, any][]): Promise<void> {
		const previous = { data: this._configuration.toData() };

		let changedKeys: string[] = [];

		for (const entry of values) {
			const [key, value] = entry;
			if (this.getValue(key) === value) {
				continue;
			}
			this._configuration.updateValue(key, value);
			changedKeys.push(key);
		}

		if (changedKeys.length > 0) {
			const configurationChangeEvent = new ConfigurationChangeEvent({ keys: changedKeys, overrides: [] }, previous, this._configuration);
			configurationChangeEvent.source = ConfigurationTarget.MEMORY;
			configurationChangeEvent.sourceConfig = null;
			this._onDidChangeConfiguration.fire(configurationChangeEvent);
		}

		return Promise.resolve();
	}
}

export class SimpleResourceConfigurationService implements ITextResourceConfigurationService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConfiguration = new Emitter<ITextResourceConfigurationChangeEvent>();

	constructor(private readonly configurationService: SimpleConfigurationService) {
		this.configurationService.onDidChangeConfiguration((e) => {
			this._onDidChangeConfiguration.fire({ affectedKeys: e.affectedKeys, affectsConfiguration: (resource: URI, configuration: string) => e.affectsConfiguration(configuration) });
		});
	}

	getValue<T>(resource: URI, section?: string): T;
	getValue<T>(resource: URI, position?: IPosition, section?: string): T;
	getValue<T>(resource: any, arg2?: any, arg3?: any) {
		const position: IPosition | null = Pos.isIPosition(arg2) ? arg2 : null;
		const section: string | undefined = position ? (typeof arg3 === 'string' ? arg3 : undefined) : (typeof arg2 === 'string' ? arg2 : undefined);
		if (typeof section === 'undefined') {
			return this.configurationService.getValue<T>();
		}
		return this.configurationService.getValue<T>(section);
	}
}

export class SimpleResourcePropertiesService implements ITextResourcePropertiesService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
	}

	getEOL(resource: URI, language?: string): string {
		const eol = this.configurationService.getValue<string>('files.eol', { overrideIdentifier: language, resource });
		if (eol && eol !== 'auto') {
			return eol;
		}
		return (isLinux || isMacintosh) ? '\n' : '\r\n';
	}
}

export class StandaloneTelemetryService implements ITelemetryService {
	declare readonly _serviceBrand: undefined;

	public publicLog(eventName: string, data?: any): Promise<void> {
		return Promise.resolve(undefined);
	}

	publicLog2<E extends ClassifiedEvent<T> = never, T extends GDPRClassification<T> = never>(eventName: string, data?: StrictPropertyCheck<T, E>) {
		return this.publicLog(eventName, data as any);
	}
}

export class SimpleWorkspaceContextService implements IWorkspaceContextService {

	public _serviceBrand: undefined;

	private static readonly SCHEME = 'inmemory';

	private readonly workspace: IWorkspace;

	constructor() {
		const resource = URI.from({ scheme: SimpleWorkspaceContextService.SCHEME, authority: 'model', path: '/' });
		this.workspace = { id: '4064f6ec-cb38-4ad0-af64-ee6467e63c82', folders: [new WorkspaceFolder({ uri: resource, name: '', index: 0 })] };
	}

	public getWorkspace(): IWorkspace {
		return this.workspace;
	}
}

export function updateConfigurationService(configurationService: IConfigurationService, source: any, isDiffEditor: boolean): void {
	if (!source) {
		return;
	}
	if (!(configurationService instanceof SimpleConfigurationService)) {
		return;
	}
	let toUpdate: [string, any][] = [];
	Object.keys(source).forEach((key) => {
		if (isEditorConfigurationKey(key)) {
			toUpdate.push([`editor.${key}`, source[key]]);
		}
		if (isDiffEditor && isDiffEditorConfigurationKey(key)) {
			toUpdate.push([`diffEditor.${key}`, source[key]]);
		}
	});
	if (toUpdate.length > 0) {
		configurationService.updateValues(toUpdate);
	}
}

export class SimpleBulkEditService implements IBulkEditService {
	declare readonly _serviceBrand: undefined;

	constructor(private readonly _modelService: IModelService) {
		//
	}

	hasPreviewHandler(): false {
		return false;
	}

	async apply(edits: ResourceEdit[], _options?: IBulkEditOptions): Promise<IBulkEditResult> {

		const textEdits = new Map<ITextModel, IIdentifiedSingleEditOperation[]>();

		for (let edit of edits) {
			if (!(edit instanceof ResourceTextEdit)) {
				throw new Error('bad edit - only text edits are supported');
			}
			const model = this._modelService.getModel(edit.resource);
			if (!model) {
				throw new Error('bad edit - model not found');
			}
			if (typeof edit.versionId === 'number' && model.getVersionId() !== edit.versionId) {
				throw new Error('bad state - model changed in the meantime');
			}
			let array = textEdits.get(model);
			if (!array) {
				array = [];
				textEdits.set(model, array);
			}
			array.push(EditOperation.replaceMove(Range.lift(edit.textEdit.range), edit.textEdit.text));
		}


		let totalEdits = 0;
		let totalFiles = 0;
		for (const [model, edits] of textEdits) {
			model.pushStackElement();
			model.pushEditOperations([], edits, () => []);
			model.pushStackElement();
			totalFiles += 1;
			totalEdits += edits.length;
		}

		return {
			ariaSummary: strings.format(SimpleServicesNLS.bulkEditServiceSummary, totalEdits, totalFiles)
		};
	}
}

export class SimpleUriLabelService implements ILabelService {

	declare readonly _serviceBrand: undefined;

	public getUriLabel(resource: URI, options?: { relative?: boolean, forceNoTildify?: boolean }): string {
		if (resource.scheme === 'file') {
			return resource.fsPath;
		}
		return resource.path;
	}
}

export class SimpleLayoutService implements ILayoutService {
	declare readonly _serviceBrand: undefined;

	public onDidLayout = Event.None;

	private _dimension?: dom.IDimension;
	get dimension(): dom.IDimension {
		if (!this._dimension) {
			this._dimension = dom.getClientArea(window.document.body);
		}

		return this._dimension;
	}

	get container(): HTMLElement {
		return this._container;
	}

	focus(): void {
		this._codeEditorService.getFocusedCodeEditor()?.focus();
	}

	constructor(private _codeEditorService: ICodeEditorService, private _container: HTMLElement) { }
}
