/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction, Separator, SubmenuAction } from 'vs/base/common/actions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IContextKeyService, ContextKeyExpression } from 'vs/platform/contextkey/common/contextkey';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { Iterable } from 'vs/base/common/iterator';
import { LinkedList } from 'vs/base/common/linkedList';
import { CSSIcon } from 'vs/base/common/codicons';

export interface ILocalizedString {
	/**
	 * The localized value of the string.
	 */
	value: string;
	/**
	 * The original (non localized value of the string)
	 */
	original: string;
}

export interface ICommandActionTitle extends ILocalizedString {
}

export type Icon = { dark?: URI; light?: URI; } | ThemeIcon;

export interface ICommandAction {
	id: string;
	title: string | ICommandActionTitle;
	shortTitle?: string | ICommandActionTitle;
	tooltip?: string;
	icon?: Icon;
	precondition?: ContextKeyExpression;
	toggled?: ContextKeyExpression | { condition: ContextKeyExpression, icon?: Icon, tooltip?: string, title?: string | ILocalizedString };
}

export interface IMenuItem {
	command: ICommandAction;
	alt?: ICommandAction;
	when?: ContextKeyExpression;
	group?: 'navigation' | string;
	order?: number;
}

export interface ISubmenuItem {
	title: string | ICommandActionTitle;
	submenu: MenuId;
	icon?: Icon;
	when?: ContextKeyExpression;
	group?: 'navigation' | string;
	order?: number;
}

export function isIMenuItem(item: IMenuItem | ISubmenuItem): item is IMenuItem {
	return (item as IMenuItem).command !== undefined;
}

export class MenuId {

	private static _idPool = 0;

	static readonly CommandPalette = new MenuId('CommandPalette');
	static readonly EditorContext = new MenuId('EditorContext');
	static readonly SimpleEditorContext = new MenuId('SimpleEditorContext');
	static readonly EditorContextCopy = new MenuId('EditorContextCopy');
	static readonly EditorContextPeek = new MenuId('EditorContextPeek');
	static readonly MenubarEditMenu = new MenuId('MenubarEditMenu');
	static readonly MenubarCopy = new MenuId('MenubarCopy');
	static readonly MenubarGoMenu = new MenuId('MenubarGoMenu');
	static readonly MenubarSelectionMenu = new MenuId('MenubarSelectionMenu');
	static readonly InlineCompletionsActions = new MenuId('InlineCompletionsActions');

	readonly id: number;
	readonly _debugName: string;

	constructor(debugName: string) {
		this.id = MenuId._idPool++;
		this._debugName = debugName;
	}
}

export interface IMenuActionOptions {
	arg?: any;
	shouldForwardArgs?: boolean;
	renderShortTitle?: boolean;
}

export interface IMenu extends IDisposable {
	readonly onDidChange: Event<IMenu>;
	getActions(options?: IMenuActionOptions): [string, Array<MenuItemAction | SubmenuItemAction>][];
}

export const IMenuService = createDecorator<IMenuService>('menuService');

export interface IMenuService {

	readonly _serviceBrand: undefined;

	createMenu(id: MenuId, contextKeyService: IContextKeyService, emitEventsForSubmenuChanges?: boolean): IMenu;
}

export type ICommandsMap = Map<string, ICommandAction>;

export interface IMenuRegistryChangeEvent {
	has(id: MenuId): boolean;
}

export interface IMenuRegistry {
	readonly onDidChangeMenu: Event<IMenuRegistryChangeEvent>;
	appendMenuItem(menu: MenuId, item: IMenuItem | ISubmenuItem): IDisposable;
	getMenuItems(loc: MenuId): Array<IMenuItem | ISubmenuItem>;
}

export const MenuRegistry: IMenuRegistry = new class implements IMenuRegistry {

	private readonly _commands = new Map<string, ICommandAction>();
	private readonly _menuItems = new Map<MenuId, LinkedList<IMenuItem | ISubmenuItem>>();
	private readonly _onDidChangeMenu = new Emitter<IMenuRegistryChangeEvent>();

	readonly onDidChangeMenu: Event<IMenuRegistryChangeEvent> = this._onDidChangeMenu.event;

	addCommand(command: ICommandAction): IDisposable {
		return this.addCommands(Iterable.single(command));
	}

	private readonly _commandPaletteChangeEvent: IMenuRegistryChangeEvent = {
		has: id => id === MenuId.CommandPalette
	};

	addCommands(commands: Iterable<ICommandAction>): IDisposable {
		for (const command of commands) {
			this._commands.set(command.id, command);
		}
		this._onDidChangeMenu.fire(this._commandPaletteChangeEvent);
		return toDisposable(() => {
			let didChange = false;
			for (const command of commands) {
				didChange = this._commands.delete(command.id) || didChange;
			}
			if (didChange) {
				this._onDidChangeMenu.fire(this._commandPaletteChangeEvent);
			}
		});
	}

	getCommand(id: string): ICommandAction | undefined {
		return this._commands.get(id);
	}

	getCommands(): ICommandsMap {
		const map = new Map<string, ICommandAction>();
		this._commands.forEach((value, key) => map.set(key, value));
		return map;
	}

	appendMenuItem(id: MenuId, item: IMenuItem | ISubmenuItem): IDisposable {
		return this.appendMenuItems(Iterable.single({ id, item }));
	}

	appendMenuItems(items: Iterable<{ id: MenuId, item: IMenuItem | ISubmenuItem }>): IDisposable {

		const changedIds = new Set<MenuId>();
		const toRemove = new LinkedList<Function>();

		for (const { id, item } of items) {
			let list = this._menuItems.get(id);
			if (!list) {
				list = new LinkedList();
				this._menuItems.set(id, list);
			}
			toRemove.push(list.push(item));
			changedIds.add(id);
		}

		this._onDidChangeMenu.fire(changedIds);

		return toDisposable(() => {
			if (toRemove.size > 0) {
				for (let fn of toRemove) {
					fn();
				}
				this._onDidChangeMenu.fire(changedIds);
				toRemove.clear();
			}
		});
	}

	getMenuItems(id: MenuId): Array<IMenuItem | ISubmenuItem> {
		let result: Array<IMenuItem | ISubmenuItem>;
		if (this._menuItems.has(id)) {
			result = [...this._menuItems.get(id)!];
		} else {
			result = [];
		}
		if (id === MenuId.CommandPalette) {
			// CommandPalette is special because it shows
			// all commands by default
			this._appendImplicitItems(result);
		}
		return result;
	}

	private _appendImplicitItems(result: Array<IMenuItem | ISubmenuItem>) {
		const set = new Set<string>();

		for (const item of result) {
			if (isIMenuItem(item)) {
				set.add(item.command.id);
				if (item.alt) {
					set.add(item.alt.id);
				}
			}
		}
		this._commands.forEach((command, id) => {
			if (!set.has(id)) {
				result.push({ command });
			}
		});
	}
};

export class SubmenuItemAction extends SubmenuAction {

	constructor(
		readonly item: ISubmenuItem,
		private readonly _menuService: IMenuService,
		private readonly _contextKeyService: IContextKeyService,
		private readonly _options?: IMenuActionOptions
	) {
		super(`submenuitem.${item.submenu.id}`, typeof item.title === 'string' ? item.title : item.title.value, [], 'submenu');
	}

	override get actions(): readonly IAction[] {
		const result: IAction[] = [];
		const menu = this._menuService.createMenu(this.item.submenu, this._contextKeyService);
		const groups = menu.getActions(this._options);
		menu.dispose();
		for (const [, actions] of groups) {
			if (actions.length > 0) {
				result.push(...actions);
				result.push(new Separator());
			}
		}
		if (result.length) {
			result.pop(); // remove last separator
		}
		return result;
	}
}

// implements IAction, does NOT extend Action, so that no one
// subscribes to events of Action or modified properties
export class MenuItemAction implements IAction {

	readonly item: ICommandAction;
	readonly alt: MenuItemAction | undefined;

	private readonly _options: IMenuActionOptions | undefined;

	readonly id: string;
	readonly label: string;
	readonly tooltip: string;
	readonly class: string | undefined;
	readonly enabled: boolean;
	readonly checked: boolean;

	constructor(
		item: ICommandAction,
		alt: ICommandAction | undefined,
		options: IMenuActionOptions | undefined,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService private _commandService: ICommandService
	) {
		this.id = item.id;
		this.label = options?.renderShortTitle && item.shortTitle
			? (typeof item.shortTitle === 'string' ? item.shortTitle : item.shortTitle.value)
			: (typeof item.title === 'string' ? item.title : item.title.value);
		this.tooltip = item.tooltip ?? '';
		this.enabled = !item.precondition || contextKeyService.contextMatchesRules(item.precondition);
		this.checked = false;

		if (item.toggled) {
			const toggled = ((item.toggled as { condition: ContextKeyExpression }).condition ? item.toggled : { condition: item.toggled }) as {
				condition: ContextKeyExpression, icon?: Icon, tooltip?: string | ILocalizedString, title?: string | ILocalizedString
			};
			this.checked = contextKeyService.contextMatchesRules(toggled.condition);
			if (this.checked && toggled.tooltip) {
				this.tooltip = typeof toggled.tooltip === 'string' ? toggled.tooltip : toggled.tooltip.value;
			}

			if (toggled.title) {
				this.label = typeof toggled.title === 'string' ? toggled.title : toggled.title.value;
			}
		}

		this.item = item;
		this.alt = alt ? new MenuItemAction(alt, undefined, options, contextKeyService, _commandService) : undefined;
		this._options = options;
		if (ThemeIcon.isThemeIcon(item.icon)) {
			this.class = CSSIcon.asClassName(item.icon);
		}
	}

	dispose(): void {
		// there is NOTHING to dispose and the MenuItemAction should
		// never have anything to dispose as it is a convenience type
		// to bridge into the rendering world.
	}

	run(...args: any[]): Promise<void> {
		let runArgs: any[] = [];

		if (this._options?.arg) {
			runArgs = [...runArgs, this._options.arg];
		}

		if (this._options?.shouldForwardArgs) {
			runArgs = [...runArgs, ...args];
		}

		return this._commandService.executeCommand(this.id, ...runArgs);
	}
}
//#endregion
