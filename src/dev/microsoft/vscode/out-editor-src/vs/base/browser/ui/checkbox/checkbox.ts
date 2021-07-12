/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./checkbox';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { Widget } from 'vs/base/browser/ui/widget';
import { Color } from 'vs/base/common/color';
import { Emitter, Event } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { CSSIcon } from 'vs/base/common/codicons';

export interface ICheckboxOpts extends ICheckboxStyles {
	readonly actionClassName?: string;
	readonly icon?: CSSIcon;
	readonly title: string;
	readonly isChecked: boolean;
	readonly notFocusable?: boolean;
}

export interface ICheckboxStyles {
	inputActiveOptionBorder?: Color;
	inputActiveOptionForeground?: Color;
	inputActiveOptionBackground?: Color;
}

const defaultOpts = {
	inputActiveOptionBorder: Color.fromHex('#007ACC00'),
	inputActiveOptionForeground: Color.fromHex('#FFFFFF'),
	inputActiveOptionBackground: Color.fromHex('#0E639C50')
};

export class Checkbox extends Widget {

	private readonly _onChange = this._register(new Emitter<boolean>());
	readonly onChange: Event<boolean /* via keyboard */> = this._onChange.event;

	private readonly _onKeyDown = this._register(new Emitter<IKeyboardEvent>());
	readonly onKeyDown: Event<IKeyboardEvent> = this._onKeyDown.event;

	private readonly _opts: ICheckboxOpts;
	readonly domNode: HTMLElement;

	private _checked: boolean;

	constructor(opts: ICheckboxOpts) {
		super();

		this._opts = { ...defaultOpts, ...opts };
		this._checked = this._opts.isChecked;

		const classes = ['monaco-custom-checkbox'];
		if (this._opts.icon) {
			classes.push(...CSSIcon.asClassNameArray(this._opts.icon));
		}
		if (this._opts.actionClassName) {
			classes.push(...this._opts.actionClassName.split(' '));
		}
		if (this._checked) {
			classes.push('checked');
		}

		this.domNode = document.createElement('div');
		this.domNode.title = this._opts.title;
		this.domNode.classList.add(...classes);
		if (!this._opts.notFocusable) {
			this.domNode.tabIndex = 0;
		}
		this.domNode.setAttribute('role', 'checkbox');
		this.domNode.setAttribute('aria-checked', String(this._checked));
		this.domNode.setAttribute('aria-label', this._opts.title);

		this.applyStyles();

		this.onclick(this.domNode, (ev) => {
			this.checked = !this._checked;
			this._onChange.fire(false);
			ev.preventDefault();
		});

		this.ignoreGesture(this.domNode);

		this.onkeydown(this.domNode, (keyboardEvent) => {
			if (keyboardEvent.keyCode === KeyCode.Space || keyboardEvent.keyCode === KeyCode.Enter) {
				this.checked = !this._checked;
				this._onChange.fire(true);
				keyboardEvent.preventDefault();
				return;
			}

			this._onKeyDown.fire(keyboardEvent);
		});
	}

	get enabled(): boolean {
		return this.domNode.getAttribute('aria-disabled') !== 'true';
	}

	focus(): void {
		this.domNode.focus();
	}

	get checked(): boolean {
		return this._checked;
	}

	set checked(newIsChecked: boolean) {
		this._checked = newIsChecked;

		this.domNode.setAttribute('aria-checked', String(this._checked));
		this.domNode.classList.toggle('checked', this._checked);

		this.applyStyles();
	}

	width(): number {
		return 2 /*marginleft*/ + 2 /*border*/ + 2 /*padding*/ + 16 /* icon width */;
	}

	style(styles: ICheckboxStyles): void {
		if (styles.inputActiveOptionBorder) {
			this._opts.inputActiveOptionBorder = styles.inputActiveOptionBorder;
		}
		if (styles.inputActiveOptionForeground) {
			this._opts.inputActiveOptionForeground = styles.inputActiveOptionForeground;
		}
		if (styles.inputActiveOptionBackground) {
			this._opts.inputActiveOptionBackground = styles.inputActiveOptionBackground;
		}
		this.applyStyles();
	}

	protected applyStyles(): void {
		if (this.domNode) {
			this.domNode.style.borderColor = this._checked && this._opts.inputActiveOptionBorder ? this._opts.inputActiveOptionBorder.toString() : 'transparent';
			this.domNode.style.color = this._checked && this._opts.inputActiveOptionForeground ? this._opts.inputActiveOptionForeground.toString() : 'inherit';
			this.domNode.style.backgroundColor = this._checked && this._opts.inputActiveOptionBackground ? this._opts.inputActiveOptionBackground.toString() : 'transparent';
		}
	}

	enable(): void {
		this.domNode.setAttribute('aria-disabled', String(false));
	}

	disable(): void {
		this.domNode.setAttribute('aria-disabled', String(true));
	}
}
