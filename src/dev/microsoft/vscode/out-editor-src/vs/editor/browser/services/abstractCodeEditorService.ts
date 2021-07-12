/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditor, IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IDecorationRenderOptions } from 'vs/editor/common/editorCommon';
import { IModelDecorationOptions } from 'vs/editor/common/model';
import { IResourceEditorInput } from 'vs/platform/editor/common/editor';
import { URI } from 'vs/base/common/uri';

export abstract class AbstractCodeEditorService extends Disposable implements ICodeEditorService {

	declare readonly _serviceBrand: undefined;

	private readonly _onCodeEditorAdd: Emitter<ICodeEditor> = this._register(new Emitter<ICodeEditor>());
	public readonly onCodeEditorAdd: Event<ICodeEditor> = this._onCodeEditorAdd.event;

	private readonly _onCodeEditorRemove: Emitter<ICodeEditor> = this._register(new Emitter<ICodeEditor>());
	public readonly onCodeEditorRemove: Event<ICodeEditor> = this._onCodeEditorRemove.event;

	private readonly _onDiffEditorAdd: Emitter<IDiffEditor> = this._register(new Emitter<IDiffEditor>());

	private readonly _onDiffEditorRemove: Emitter<IDiffEditor> = this._register(new Emitter<IDiffEditor>());

	protected readonly _onDecorationTypeRegistered: Emitter<string> = this._register(new Emitter<string>());

	private readonly _codeEditors: { [editorId: string]: ICodeEditor; };
	private readonly _diffEditors: { [editorId: string]: IDiffEditor; };

	constructor() {
		super();
		this._codeEditors = Object.create(null);
		this._diffEditors = Object.create(null);
	}

	addCodeEditor(editor: ICodeEditor): void {
		this._codeEditors[editor.getId()] = editor;
		this._onCodeEditorAdd.fire(editor);
	}

	removeCodeEditor(editor: ICodeEditor): void {
		if (delete this._codeEditors[editor.getId()]) {
			this._onCodeEditorRemove.fire(editor);
		}
	}

	listCodeEditors(): ICodeEditor[] {
		return Object.keys(this._codeEditors).map(id => this._codeEditors[id]);
	}

	addDiffEditor(editor: IDiffEditor): void {
		this._diffEditors[editor.getId()] = editor;
		this._onDiffEditorAdd.fire(editor);
	}

	removeDiffEditor(editor: IDiffEditor): void {
		if (delete this._diffEditors[editor.getId()]) {
			this._onDiffEditorRemove.fire(editor);
		}
	}

	listDiffEditors(): IDiffEditor[] {
		return Object.keys(this._diffEditors).map(id => this._diffEditors[id]);
	}

	getFocusedCodeEditor(): ICodeEditor | null {
		let editorWithWidgetFocus: ICodeEditor | null = null;

		const editors = this.listCodeEditors();
		for (const editor of editors) {

			if (editor.hasTextFocus()) {
				// bingo!
				return editor;
			}

			if (editor.hasWidgetFocus()) {
				editorWithWidgetFocus = editor;
			}
		}

		return editorWithWidgetFocus;
	}

	abstract registerDecorationType(description: string, key: string, options: IDecorationRenderOptions, parentTypeKey?: string, editor?: ICodeEditor): void;
	abstract removeDecorationType(key: string): void;
	abstract resolveDecorationOptions(decorationTypeKey: string | undefined, writable: boolean): IModelDecorationOptions;
	private readonly _modelProperties = new Map<string, Map<string, any>>();

	public setModelProperty(resource: URI, key: string, value: any): void {
		const key1 = resource.toString();
		let dest: Map<string, any>;
		if (this._modelProperties.has(key1)) {
			dest = this._modelProperties.get(key1)!;
		} else {
			dest = new Map<string, any>();
			this._modelProperties.set(key1, dest);
		}

		dest.set(key, value);
	}

	public getModelProperty(resource: URI, key: string): any {
		const key1 = resource.toString();
		if (this._modelProperties.has(key1)) {
			const innerMap = this._modelProperties.get(key1)!;
			return innerMap.get(key);
		}
		return undefined;
	}

	abstract getActiveCodeEditor(): ICodeEditor | null;
	abstract openCodeEditor(input: IResourceEditorInput, source: ICodeEditor | null, sideBySide?: boolean): Promise<ICodeEditor | null>;
}
