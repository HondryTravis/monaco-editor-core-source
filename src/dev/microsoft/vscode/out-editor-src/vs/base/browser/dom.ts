/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as browser from 'vs/base/browser/browser';
import { domEvent } from 'vs/base/browser/event';
import { IKeyboardEvent, StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IMouseEvent, StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { TimeoutTimer } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import * as platform from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { FileAccess, RemoteAuthorities } from 'vs/base/common/network';
import { BrowserFeatures } from 'vs/base/browser/canIUse';
import { KeyCode } from 'vs/base/common/keyCodes';

export function clearNode(node: HTMLElement): void {
	while (node.firstChild) {
		node.firstChild.remove();
	}
}

/**
 * @deprecated Use node.isConnected directly
 */
export function isInDOM(node: Node | null): boolean {
	return node?.isConnected ?? false;
}

class DomListener implements IDisposable {

	private _handler: (e: any) => void;
	private _node: EventTarget;
	private readonly _type: string;
	private readonly _options: boolean | AddEventListenerOptions;

	constructor(node: EventTarget, type: string, handler: (e: any) => void, options?: boolean | AddEventListenerOptions) {
		this._node = node;
		this._type = type;
		this._handler = handler;
		this._options = (options || false);
		this._node.addEventListener(this._type, this._handler, this._options);
	}

	public dispose(): void {
		if (!this._handler) {
			// Already disposed
			return;
		}

		this._node.removeEventListener(this._type, this._handler, this._options);

		// Prevent leakers from holding on to the dom or handler func
		this._node = null!;
		this._handler = null!;
	}
}

export function addDisposableListener<K extends keyof GlobalEventHandlersEventMap>(node: EventTarget, type: K, handler: (event: GlobalEventHandlersEventMap[K]) => void, useCapture?: boolean): IDisposable;
export function addDisposableListener(node: EventTarget, type: string, handler: (event: any) => void, useCapture?: boolean): IDisposable;
export function addDisposableListener(node: EventTarget, type: string, handler: (event: any) => void, options: AddEventListenerOptions): IDisposable;
export function addDisposableListener(node: EventTarget, type: string, handler: (event: any) => void, useCaptureOrOptions?: boolean | AddEventListenerOptions): IDisposable {
	return new DomListener(node, type, handler, useCaptureOrOptions);
}

export interface IAddStandardDisposableListenerSignature {
	(node: HTMLElement, type: 'click', handler: (event: IMouseEvent) => void, useCapture?: boolean): IDisposable;
	(node: HTMLElement, type: 'mousedown', handler: (event: IMouseEvent) => void, useCapture?: boolean): IDisposable;
	(node: HTMLElement, type: 'keydown', handler: (event: IKeyboardEvent) => void, useCapture?: boolean): IDisposable;
	(node: HTMLElement, type: 'keypress', handler: (event: IKeyboardEvent) => void, useCapture?: boolean): IDisposable;
	(node: HTMLElement, type: 'keyup', handler: (event: IKeyboardEvent) => void, useCapture?: boolean): IDisposable;
	(node: HTMLElement, type: string, handler: (event: any) => void, useCapture?: boolean): IDisposable;
}
function _wrapAsStandardMouseEvent(handler: (e: IMouseEvent) => void): (e: MouseEvent) => void {
	return function (e: MouseEvent) {
		return handler(new StandardMouseEvent(e));
	};
}
function _wrapAsStandardKeyboardEvent(handler: (e: IKeyboardEvent) => void): (e: KeyboardEvent) => void {
	return function (e: KeyboardEvent) {
		return handler(new StandardKeyboardEvent(e));
	};
}
export let addStandardDisposableListener: IAddStandardDisposableListenerSignature = function addStandardDisposableListener(node: HTMLElement, type: string, handler: (event: any) => void, useCapture?: boolean): IDisposable {
	let wrapHandler = handler;

	if (type === 'click' || type === 'mousedown') {
		wrapHandler = _wrapAsStandardMouseEvent(handler);
	} else if (type === 'keydown' || type === 'keypress' || type === 'keyup') {
		wrapHandler = _wrapAsStandardKeyboardEvent(handler);
	}

	return addDisposableListener(node, type, wrapHandler, useCapture);
};

export let addStandardDisposableGenericMouseDownListner = function addStandardDisposableListener(node: HTMLElement, handler: (event: any) => void, useCapture?: boolean): IDisposable {
	let wrapHandler = _wrapAsStandardMouseEvent(handler);

	return addDisposableGenericMouseDownListner(node, wrapHandler, useCapture);
};
export function addDisposableGenericMouseDownListner(node: EventTarget, handler: (event: any) => void, useCapture?: boolean): IDisposable {
	return addDisposableListener(node, platform.isIOS && BrowserFeatures.pointerEvents ? EventType.POINTER_DOWN : EventType.MOUSE_DOWN, handler, useCapture);
}

export function addDisposableGenericMouseUpListner(node: EventTarget, handler: (event: any) => void, useCapture?: boolean): IDisposable {
	return addDisposableListener(node, platform.isIOS && BrowserFeatures.pointerEvents ? EventType.POINTER_UP : EventType.MOUSE_UP, handler, useCapture);
}
export function addDisposableNonBubblingMouseOutListener(node: Element, handler: (event: MouseEvent) => void): IDisposable {
	return addDisposableListener(node, 'mouseout', (e: MouseEvent) => {
		// Mouse out bubbles, so this is an attempt to ignore faux mouse outs coming from children elements
		let toElement: Node | null = <Node>(e.relatedTarget);
		while (toElement && toElement !== node) {
			toElement = toElement.parentNode;
		}
		if (toElement === node) {
			return;
		}

		handler(e);
	});
}

export function addDisposableNonBubblingPointerOutListener(node: Element, handler: (event: MouseEvent) => void): IDisposable {
	return addDisposableListener(node, 'pointerout', (e: MouseEvent) => {
		// Mouse out bubbles, so this is an attempt to ignore faux mouse outs coming from children elements
		let toElement: Node | null = <Node>(e.relatedTarget);
		while (toElement && toElement !== node) {
			toElement = toElement.parentNode;
		}
		if (toElement === node) {
			return;
		}

		handler(e);
	});
}

interface IRequestAnimationFrame {
	(callback: (time: number) => void): number;
}
let _animationFrame: IRequestAnimationFrame | null = null;
function doRequestAnimationFrame(callback: (time: number) => void): number {
	if (!_animationFrame) {
		const emulatedRequestAnimationFrame = (callback: (time: number) => void): any => {
			return setTimeout(() => callback(new Date().getTime()), 0);
		};
		_animationFrame = (
			self.requestAnimationFrame
			|| (<any>self).msRequestAnimationFrame
			|| (<any>self).webkitRequestAnimationFrame
			|| (<any>self).mozRequestAnimationFrame
			|| (<any>self).oRequestAnimationFrame
			|| emulatedRequestAnimationFrame
		);
	}
	return _animationFrame.call(self, callback);
}

/**
 * Schedule a callback to be run at the next animation frame.
 * This allows multiple parties to register callbacks that should run at the next animation frame.
 * If currently in an animation frame, `runner` will be executed immediately.
 * @return token that can be used to cancel the scheduled runner (only if `runner` was not executed immediately).
 */
export let runAtThisOrScheduleAtNextAnimationFrame: (runner: () => void, priority?: number) => IDisposable;
/**
 * Schedule a callback to be run at the next animation frame.
 * This allows multiple parties to register callbacks that should run at the next animation frame.
 * If currently in an animation frame, `runner` will be executed at the next animation frame.
 * @return token that can be used to cancel the scheduled runner.
 */
export let scheduleAtNextAnimationFrame: (runner: () => void, priority?: number) => IDisposable;

class AnimationFrameQueueItem implements IDisposable {

	private _runner: () => void;
	public priority: number;
	private _canceled: boolean;

	constructor(runner: () => void, priority: number = 0) {
		this._runner = runner;
		this.priority = priority;
		this._canceled = false;
	}

	public dispose(): void {
		this._canceled = true;
	}

	public execute(): void {
		if (this._canceled) {
			return;
		}

		try {
			this._runner();
		} catch (e) {
			onUnexpectedError(e);
		}
	}

	// Sort by priority (largest to lowest)
	public static sort(a: AnimationFrameQueueItem, b: AnimationFrameQueueItem): number {
		return b.priority - a.priority;
	}
}

(function () {
	/**
	 * The runners scheduled at the next animation frame
	 */
	let NEXT_QUEUE: AnimationFrameQueueItem[] = [];
	/**
	 * The runners scheduled at the current animation frame
	 */
	let CURRENT_QUEUE: AnimationFrameQueueItem[] | null = null;
	/**
	 * A flag to keep track if the native requestAnimationFrame was already called
	 */
	let animFrameRequested = false;
	/**
	 * A flag to indicate if currently handling a native requestAnimationFrame callback
	 */
	let inAnimationFrameRunner = false;

	let animationFrameRunner = () => {
		animFrameRequested = false;

		CURRENT_QUEUE = NEXT_QUEUE;
		NEXT_QUEUE = [];

		inAnimationFrameRunner = true;
		while (CURRENT_QUEUE.length > 0) {
			CURRENT_QUEUE.sort(AnimationFrameQueueItem.sort);
			let top = CURRENT_QUEUE.shift()!;
			top.execute();
		}
		inAnimationFrameRunner = false;
	};

	scheduleAtNextAnimationFrame = (runner: () => void, priority: number = 0) => {
		let item = new AnimationFrameQueueItem(runner, priority);
		NEXT_QUEUE.push(item);

		if (!animFrameRequested) {
			animFrameRequested = true;
			doRequestAnimationFrame(animationFrameRunner);
		}

		return item;
	};

	runAtThisOrScheduleAtNextAnimationFrame = (runner: () => void, priority?: number) => {
		if (inAnimationFrameRunner) {
			let item = new AnimationFrameQueueItem(runner, priority);
			CURRENT_QUEUE!.push(item);
			return item;
		} else {
			return scheduleAtNextAnimationFrame(runner, priority);
		}
	};
})();

/**
 * Add a throttled listener. `handler` is fired at most every 8.33333ms or with the next animation frame (if browser supports it).
 */
export interface IEventMerger<R, E> {
	(lastEvent: R | null, currentEvent: E): R;
}

export interface DOMEvent {
}

const MINIMUM_TIME_MS = 8;
const DEFAULT_EVENT_MERGER: IEventMerger<DOMEvent, DOMEvent> = function (lastEvent: DOMEvent | null, currentEvent: DOMEvent) {
	return currentEvent;
};

class TimeoutThrottledDomListener<R, E extends DOMEvent> extends Disposable {

	constructor(node: any, type: string, handler: (event: R) => void, eventMerger: IEventMerger<R, E> = <any>DEFAULT_EVENT_MERGER, minimumTimeMs: number = MINIMUM_TIME_MS) {
		super();

		let lastEvent: R | null = null;
		let lastHandlerTime = 0;
		let timeout = this._register(new TimeoutTimer());

		let invokeHandler = () => {
			lastHandlerTime = (new Date()).getTime();
			handler(<R>lastEvent);
			lastEvent = null;
		};

		this._register(addDisposableListener(node, type, (e) => {

			lastEvent = eventMerger(lastEvent, e);
			let elapsedTime = (new Date()).getTime() - lastHandlerTime;

			if (elapsedTime >= minimumTimeMs) {
				timeout.cancel();
				invokeHandler();
			} else {
				timeout.setIfNotSet(invokeHandler, minimumTimeMs - elapsedTime);
			}
		}));
	}
}

export function addDisposableThrottledListener<R, E extends DOMEvent = DOMEvent>(node: any, type: string, handler: (event: R) => void, eventMerger?: IEventMerger<R, E>, minimumTimeMs?: number): IDisposable {
	return new TimeoutThrottledDomListener<R, E>(node, type, handler, eventMerger, minimumTimeMs);
}

export function getComputedStyle(el: HTMLElement): CSSStyleDeclaration {
	return document.defaultView!.getComputedStyle(el, null);
}

export function getClientArea(element: HTMLElement): Dimension {

	// Try with DOM clientWidth / clientHeight
	if (element !== document.body) {
		return new Dimension(element.clientWidth, element.clientHeight);
	}

	// If visual view port exits and it's on mobile, it should be used instead of window innerWidth / innerHeight, or document.body.clientWidth / document.body.clientHeight
	if (platform.isIOS && window.visualViewport) {
		return new Dimension(window.visualViewport.width, window.visualViewport.height);
	}

	// Try innerWidth / innerHeight
	if (window.innerWidth && window.innerHeight) {
		return new Dimension(window.innerWidth, window.innerHeight);
	}

	// Try with document.body.clientWidth / document.body.clientHeight
	if (document.body && document.body.clientWidth && document.body.clientHeight) {
		return new Dimension(document.body.clientWidth, document.body.clientHeight);
	}

	// Try with document.documentElement.clientWidth / document.documentElement.clientHeight
	if (document.documentElement && document.documentElement.clientWidth && document.documentElement.clientHeight) {
		return new Dimension(document.documentElement.clientWidth, document.documentElement.clientHeight);
	}

	throw new Error('Unable to figure out browser width and height');
}

class SizeUtils {
	// Adapted from WinJS
	// Converts a CSS positioning string for the specified element to pixels.
	private static convertToPixels(element: HTMLElement, value: string): number {
		return parseFloat(value) || 0;
	}

	private static getDimension(element: HTMLElement, cssPropertyName: string, jsPropertyName: string): number {
		let computedStyle: CSSStyleDeclaration = getComputedStyle(element);
		let value = '0';
		if (computedStyle) {
			if (computedStyle.getPropertyValue) {
				value = computedStyle.getPropertyValue(cssPropertyName);
			} else {
				// IE8
				value = (<any>computedStyle).getAttribute(jsPropertyName);
			}
		}
		return SizeUtils.convertToPixels(element, value);
	}

	static getBorderLeftWidth(element: HTMLElement): number {
		return SizeUtils.getDimension(element, 'border-left-width', 'borderLeftWidth');
	}
	static getBorderRightWidth(element: HTMLElement): number {
		return SizeUtils.getDimension(element, 'border-right-width', 'borderRightWidth');
	}
	static getBorderTopWidth(element: HTMLElement): number {
		return SizeUtils.getDimension(element, 'border-top-width', 'borderTopWidth');
	}
	static getBorderBottomWidth(element: HTMLElement): number {
		return SizeUtils.getDimension(element, 'border-bottom-width', 'borderBottomWidth');
	}

	static getPaddingLeft(element: HTMLElement): number {
		return SizeUtils.getDimension(element, 'padding-left', 'paddingLeft');
	}
	static getPaddingRight(element: HTMLElement): number {
		return SizeUtils.getDimension(element, 'padding-right', 'paddingRight');
	}
	static getPaddingTop(element: HTMLElement): number {
		return SizeUtils.getDimension(element, 'padding-top', 'paddingTop');
	}
	static getPaddingBottom(element: HTMLElement): number {
		return SizeUtils.getDimension(element, 'padding-bottom', 'paddingBottom');
	}

	static getMarginLeft(element: HTMLElement): number {
		return SizeUtils.getDimension(element, 'margin-left', 'marginLeft');
	}
	static getMarginTop(element: HTMLElement): number {
		return SizeUtils.getDimension(element, 'margin-top', 'marginTop');
	}
	static getMarginRight(element: HTMLElement): number {
		return SizeUtils.getDimension(element, 'margin-right', 'marginRight');
	}
	static getMarginBottom(element: HTMLElement): number {
		return SizeUtils.getDimension(element, 'margin-bottom', 'marginBottom');
	}
}

// ----------------------------------------------------------------------------------------
// Position & Dimension

export interface IDimension {
	readonly width: number;
	readonly height: number;
}

export class Dimension implements IDimension {

	constructor(
		public readonly width: number,
		public readonly height: number,
	) { }

	with(width: number = this.width, height: number = this.height): Dimension {
		if (width !== this.width || height !== this.height) {
			return new Dimension(width, height);
		} else {
			return this;
		}
	}

	static is(obj: unknown): obj is IDimension {
		return typeof obj === 'object' && typeof (<IDimension>obj).height === 'number' && typeof (<IDimension>obj).width === 'number';
	}

	static lift(obj: IDimension): Dimension {
		if (obj instanceof Dimension) {
			return obj;
		} else {
			return new Dimension(obj.width, obj.height);
		}
	}

	static equals(a: Dimension | undefined, b: Dimension | undefined): boolean {
		if (a === b) {
			return true;
		}
		if (!a || !b) {
			return false;
		}
		return a.width === b.width && a.height === b.height;
	}
}

export function getTopLeftOffset(element: HTMLElement): { left: number; top: number; } {
	// Adapted from WinJS.Utilities.getPosition
	// and added borders to the mix

	let offsetParent = element.offsetParent;
	let top = element.offsetTop;
	let left = element.offsetLeft;

	while (
		(element = <HTMLElement>element.parentNode) !== null
		&& element !== document.body
		&& element !== document.documentElement
	) {
		top -= element.scrollTop;
		const c = isShadowRoot(element) ? null : getComputedStyle(element);
		if (c) {
			left -= c.direction !== 'rtl' ? element.scrollLeft : -element.scrollLeft;
		}

		if (element === offsetParent) {
			left += SizeUtils.getBorderLeftWidth(element);
			top += SizeUtils.getBorderTopWidth(element);
			top += element.offsetTop;
			left += element.offsetLeft;
			offsetParent = element.offsetParent;
		}
	}

	return {
		left: left,
		top: top
	};
}

export interface IDomNodePagePosition {
	left: number;
	top: number;
	width: number;
	height: number;
}

export function size(element: HTMLElement, width: number | null, height: number | null): void {
	if (typeof width === 'number') {
		element.style.width = `${width}px`;
	}

	if (typeof height === 'number') {
		element.style.height = `${height}px`;
	}
}

/**
 * Returns the position of a dom node relative to the entire page.
 */
export function getDomNodePagePosition(domNode: HTMLElement): IDomNodePagePosition {
	let bb = domNode.getBoundingClientRect();
	return {
		left: bb.left + StandardWindow.scrollX,
		top: bb.top + StandardWindow.scrollY,
		width: bb.width,
		height: bb.height
	};
}

export interface IStandardWindow {
	readonly scrollX: number;
	readonly scrollY: number;
}

export const StandardWindow: IStandardWindow = new class implements IStandardWindow {
	get scrollX(): number {
		if (typeof window.scrollX === 'number') {
			// modern browsers
			return window.scrollX;
		} else {
			return document.body.scrollLeft + document.documentElement!.scrollLeft;
		}
	}

	get scrollY(): number {
		if (typeof window.scrollY === 'number') {
			// modern browsers
			return window.scrollY;
		} else {
			return document.body.scrollTop + document.documentElement!.scrollTop;
		}
	}
};

// Adapted from WinJS
// Gets the width of the element, including margins.
export function getTotalWidth(element: HTMLElement): number {
	let margin = SizeUtils.getMarginLeft(element) + SizeUtils.getMarginRight(element);
	return element.offsetWidth + margin;
}

export function getContentWidth(element: HTMLElement): number {
	let border = SizeUtils.getBorderLeftWidth(element) + SizeUtils.getBorderRightWidth(element);
	let padding = SizeUtils.getPaddingLeft(element) + SizeUtils.getPaddingRight(element);
	return element.offsetWidth - border - padding;
}

// Adapted from WinJS
// Gets the height of the content of the specified element. The content height does not include borders or padding.
export function getContentHeight(element: HTMLElement): number {
	let border = SizeUtils.getBorderTopWidth(element) + SizeUtils.getBorderBottomWidth(element);
	let padding = SizeUtils.getPaddingTop(element) + SizeUtils.getPaddingBottom(element);
	return element.offsetHeight - border - padding;
}

// Adapted from WinJS
// Gets the height of the element, including its margins.
export function getTotalHeight(element: HTMLElement): number {
	let margin = SizeUtils.getMarginTop(element) + SizeUtils.getMarginBottom(element);
	return element.offsetHeight + margin;
}

// ----------------------------------------------------------------------------------------

export function isAncestor(testChild: Node | null, testAncestor: Node | null): boolean {
	while (testChild) {
		if (testChild === testAncestor) {
			return true;
		}
		testChild = testChild.parentNode;
	}

	return false;
}

export function findParentWithClass(node: HTMLElement, clazz: string, stopAtClazzOrNode?: string | HTMLElement): HTMLElement | null {
	while (node && node.nodeType === node.ELEMENT_NODE) {
		if (node.classList.contains(clazz)) {
			return node;
		}

		if (stopAtClazzOrNode) {
			if (typeof stopAtClazzOrNode === 'string') {
				if (node.classList.contains(stopAtClazzOrNode)) {
					return null;
				}
			} else {
				if (node === stopAtClazzOrNode) {
					return null;
				}
			}
		}

		node = <HTMLElement>node.parentNode;
	}

	return null;
}

export function hasParentWithClass(node: HTMLElement, clazz: string, stopAtClazzOrNode?: string | HTMLElement): boolean {
	return !!findParentWithClass(node, clazz, stopAtClazzOrNode);
}

export function isShadowRoot(node: Node): node is ShadowRoot {
	return (
		node && !!(<ShadowRoot>node).host && !!(<ShadowRoot>node).mode
	);
}

export function isInShadowDOM(domNode: Node): boolean {
	return !!getShadowRoot(domNode);
}

export function getShadowRoot(domNode: Node): ShadowRoot | null {
	while (domNode.parentNode) {
		if (domNode === document.body) {
			// reached the body
			return null;
		}
		domNode = domNode.parentNode;
	}
	return isShadowRoot(domNode) ? domNode : null;
}

export function getActiveElement(): Element | null {
	let result = document.activeElement;

	while (result?.shadowRoot) {
		result = result.shadowRoot.activeElement;
	}

	return result;
}

export function createStyleSheet(container: HTMLElement = document.getElementsByTagName('head')[0]): HTMLStyleElement {
	let style = document.createElement('style');
	style.type = 'text/css';
	style.media = 'screen';
	container.appendChild(style);
	return style;
}

let _sharedStyleSheet: HTMLStyleElement | null = null;
function getSharedStyleSheet(): HTMLStyleElement {
	if (!_sharedStyleSheet) {
		_sharedStyleSheet = createStyleSheet();
	}
	return _sharedStyleSheet;
}

function getDynamicStyleSheetRules(style: any) {
	if (style?.sheet?.rules) {
		// Chrome, IE
		return style.sheet.rules;
	}
	if (style?.sheet?.cssRules) {
		// FF
		return style.sheet.cssRules;
	}
	return [];
}

export function createCSSRule(selector: string, cssText: string, style: HTMLStyleElement = getSharedStyleSheet()): void {
	if (!style || !cssText) {
		return;
	}

	(<CSSStyleSheet>style.sheet).insertRule(selector + '{' + cssText + '}', 0);
}

export function removeCSSRulesContainingSelector(ruleName: string, style: HTMLStyleElement = getSharedStyleSheet()): void {
	if (!style) {
		return;
	}

	let rules = getDynamicStyleSheetRules(style);
	let toDelete: number[] = [];
	for (let i = 0; i < rules.length; i++) {
		let rule = rules[i];
		if (rule.selectorText.indexOf(ruleName) !== -1) {
			toDelete.push(i);
		}
	}

	for (let i = toDelete.length - 1; i >= 0; i--) {
		(<any>style.sheet).deleteRule(toDelete[i]);
	}
}

export function isHTMLElement(o: any): o is HTMLElement {
	if (typeof HTMLElement === 'object') {
		return o instanceof HTMLElement;
	}
	return o && typeof o === 'object' && o.nodeType === 1 && typeof o.nodeName === 'string';
}

export const EventType = {
	// Mouse
	CLICK: 'click',
	AUXCLICK: 'auxclick',
	DBLCLICK: 'dblclick',
	MOUSE_UP: 'mouseup',
	MOUSE_DOWN: 'mousedown',
	MOUSE_OVER: 'mouseover',
	MOUSE_MOVE: 'mousemove',
	MOUSE_OUT: 'mouseout',
	MOUSE_ENTER: 'mouseenter',
	MOUSE_LEAVE: 'mouseleave',
	MOUSE_WHEEL: 'wheel',
	POINTER_UP: 'pointerup',
	POINTER_DOWN: 'pointerdown',
	POINTER_MOVE: 'pointermove',
	CONTEXT_MENU: 'contextmenu',
	WHEEL: 'wheel',
	// Keyboard
	KEY_DOWN: 'keydown',
	KEY_PRESS: 'keypress',
	KEY_UP: 'keyup',
	// HTML Document
	LOAD: 'load',
	BEFORE_UNLOAD: 'beforeunload',
	UNLOAD: 'unload',
	ABORT: 'abort',
	ERROR: 'error',
	RESIZE: 'resize',
	SCROLL: 'scroll',
	FULLSCREEN_CHANGE: 'fullscreenchange',
	WK_FULLSCREEN_CHANGE: 'webkitfullscreenchange',
	// Form
	SELECT: 'select',
	CHANGE: 'change',
	SUBMIT: 'submit',
	RESET: 'reset',
	FOCUS: 'focus',
	FOCUS_IN: 'focusin',
	FOCUS_OUT: 'focusout',
	BLUR: 'blur',
	INPUT: 'input',
	// Local Storage
	STORAGE: 'storage',
	// Drag
	DRAG_START: 'dragstart',
	DRAG: 'drag',
	DRAG_ENTER: 'dragenter',
	DRAG_LEAVE: 'dragleave',
	DRAG_OVER: 'dragover',
	DROP: 'drop',
	DRAG_END: 'dragend',
	// Animation
	ANIMATION_START: browser.isWebKit ? 'webkitAnimationStart' : 'animationstart',
	ANIMATION_END: browser.isWebKit ? 'webkitAnimationEnd' : 'animationend',
	ANIMATION_ITERATION: browser.isWebKit ? 'webkitAnimationIteration' : 'animationiteration'
} as const;

export interface EventLike {
	preventDefault(): void;
	stopPropagation(): void;
}

export const EventHelper = {
	stop: function (e: EventLike, cancelBubble?: boolean) {
		if (e.preventDefault) {
			e.preventDefault();
		} else {
			// IE8
			(<any>e).returnValue = false;
		}

		if (cancelBubble) {
			if (e.stopPropagation) {
				e.stopPropagation();
			} else {
				// IE8
				(<any>e).cancelBubble = true;
			}
		}
	}
};

export interface IFocusTracker extends Disposable {
	onDidFocus: Event<void>;
	onDidBlur: Event<void>;
}

export function saveParentsScrollTop(node: Element): number[] {
	let r: number[] = [];
	for (let i = 0; node && node.nodeType === node.ELEMENT_NODE; i++) {
		r[i] = node.scrollTop;
		node = <Element>node.parentNode;
	}
	return r;
}

export function restoreParentsScrollTop(node: Element, state: number[]): void {
	for (let i = 0; node && node.nodeType === node.ELEMENT_NODE; i++) {
		if (node.scrollTop !== state[i]) {
			node.scrollTop = state[i];
		}
		node = <Element>node.parentNode;
	}
}

class FocusTracker extends Disposable implements IFocusTracker {

	private readonly _onDidFocus = this._register(new Emitter<void>());
	public readonly onDidFocus: Event<void> = this._onDidFocus.event;

	private readonly _onDidBlur = this._register(new Emitter<void>());
	public readonly onDidBlur: Event<void> = this._onDidBlur.event;

	private _refreshStateHandler: () => void;

	constructor(element: HTMLElement | Window) {
		super();
		let hasFocus = isAncestor(document.activeElement, <HTMLElement>element);
		let loosingFocus = false;

		const onFocus = () => {
			loosingFocus = false;
			if (!hasFocus) {
				hasFocus = true;
				this._onDidFocus.fire();
			}
		};

		const onBlur = () => {
			if (hasFocus) {
				loosingFocus = true;
				window.setTimeout(() => {
					if (loosingFocus) {
						loosingFocus = false;
						hasFocus = false;
						this._onDidBlur.fire();
					}
				}, 0);
			}
		};

		this._refreshStateHandler = () => {
			let currentNodeHasFocus = isAncestor(document.activeElement, <HTMLElement>element);
			if (currentNodeHasFocus !== hasFocus) {
				if (hasFocus) {
					onBlur();
				} else {
					onFocus();
				}
			}
		};

		this._register(domEvent(element, EventType.FOCUS, true)(onFocus));
		this._register(domEvent(element, EventType.BLUR, true)(onBlur));
	}
}

export function trackFocus(element: HTMLElement | Window): IFocusTracker {
	return new FocusTracker(element);
}

export function append<T extends Node>(parent: HTMLElement, child: T): T;
export function append<T extends Node>(parent: HTMLElement, ...children: (T | string)[]): void;
export function append<T extends Node>(parent: HTMLElement, ...children: (T | string)[]): T | void {
	parent.append(...children);
	if (children.length === 1 && typeof children[0] !== 'string') {
		return <T>children[0];
	}
}

/**
 * Removes all children from `parent` and appends `children`
 */
export function reset(parent: HTMLElement, ...children: Array<Node | string>): void {
	parent.innerText = '';
	append(parent, ...children);
}

const SELECTOR_REGEX = /([\w\-]+)?(#([\w\-]+))?((\.([\w\-]+))*)/;

export enum Namespace {
	HTML = 'http://www.w3.org/1999/xhtml',
	SVG = 'http://www.w3.org/2000/svg'
}

function _$<T extends Element>(namespace: Namespace, description: string, attrs?: { [key: string]: any; }, ...children: Array<Node | string>): T {
	let match = SELECTOR_REGEX.exec(description);

	if (!match) {
		throw new Error('Bad use of emmet');
	}

	attrs = { ...(attrs || {}) };

	let tagName = match[1] || 'div';
	let result: T;

	if (namespace !== Namespace.HTML) {
		result = document.createElementNS(namespace as string, tagName) as T;
	} else {
		result = document.createElement(tagName) as unknown as T;
	}

	if (match[3]) {
		result.id = match[3];
	}
	if (match[4]) {
		result.className = match[4].replace(/\./g, ' ').trim();
	}

	Object.keys(attrs).forEach(name => {
		const value = attrs![name];

		if (typeof value === 'undefined') {
			return;
		}

		if (/^on\w+$/.test(name)) {
			(<any>result)[name] = value;
		} else if (name === 'selected') {
			if (value) {
				result.setAttribute(name, 'true');
			}

		} else {
			result.setAttribute(name, value);
		}
	});

	result.append(...children);

	return result as T;
}

export function $<T extends HTMLElement>(description: string, attrs?: { [key: string]: any; }, ...children: Array<Node | string>): T {
	return _$(Namespace.HTML, description, attrs, ...children);
}

$.SVG = function <T extends SVGElement>(description: string, attrs?: { [key: string]: any; }, ...children: Array<Node | string>): T {
	return _$(Namespace.SVG, description, attrs, ...children);
};

export function show(...elements: HTMLElement[]): void {
	for (let element of elements) {
		element.style.display = '';
		element.removeAttribute('aria-hidden');
	}
}

export function hide(...elements: HTMLElement[]): void {
	for (let element of elements) {
		element.style.display = 'none';
		element.setAttribute('aria-hidden', 'true');
	}
}

export function getElementsByTagName(tag: string): HTMLElement[] {
	return Array.prototype.slice.call(document.getElementsByTagName(tag), 0);
}

/**
 * Find a value usable for a dom node size such that the likelihood that it would be
 * displayed with constant screen pixels size is as high as possible.
 *
 * e.g. We would desire for the cursors to be 2px (CSS px) wide. Under a devicePixelRatio
 * of 1.25, the cursor will be 2.5 screen pixels wide. Depending on how the dom node aligns/"snaps"
 * with the screen pixels, it will sometimes be rendered with 2 screen pixels, and sometimes with 3 screen pixels.
 */
export function computeScreenAwareSize(cssPx: number): number {
	const screenPx = window.devicePixelRatio * cssPx;
	return Math.max(1, Math.floor(screenPx)) / window.devicePixelRatio;
}

/**
 * Open safely a new window. This is the best way to do so, but you cannot tell
 * if the window was opened or if it was blocked by the brower's popup blocker.
 * If you want to tell if the browser blocked the new window, use `windowOpenNoOpenerWithSuccess`.
 *
 * See https://github.com/microsoft/monaco-editor/issues/601
 * To protect against malicious code in the linked site, particularly phishing attempts,
 * the window.opener should be set to null to prevent the linked site from having access
 * to change the location of the current page.
 * See https://mathiasbynens.github.io/rel-noopener/
 */
export function windowOpenNoOpener(url: string): void {
	// By using 'noopener' in the `windowFeatures` argument, the newly created window will
	// not be able to use `window.opener` to reach back to the current page.
	// See https://stackoverflow.com/a/46958731
	// See https://developer.mozilla.org/en-US/docs/Web/API/Window/open#noopener
	// However, this also doesn't allow us to realize if the browser blocked
	// the creation of the window.
	window.open(url, '_blank', 'noopener');
}

export function animate(fn: () => void): IDisposable {
	const step = () => {
		fn();
		stepDisposable = scheduleAtNextAnimationFrame(step);
	};

	let stepDisposable = scheduleAtNextAnimationFrame(step);
	return toDisposable(() => stepDisposable.dispose());
}

RemoteAuthorities.setPreferredWebSchema(/^https:/.test(window.location.href) ? 'https' : 'http');

/**
 * returns url('...')
 */
export function asCSSUrl(uri: URI): string {
	if (!uri) {
		return `url('')`;
	}
	return `url('${FileAccess.asBrowserUri(uri).toString(true).replace(/'/g, '%27')}')`;
}

export function asCSSPropertyValue(value: string) {
	return `'${value.replace(/'/g, '%27')}'`;
}

type ModifierKey = 'alt' | 'ctrl' | 'shift' | 'meta';

export interface IModifierKeyStatus {
	altKey: boolean;
	shiftKey: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
	lastKeyPressed?: ModifierKey;
	lastKeyReleased?: ModifierKey;
	event?: KeyboardEvent;
}

export class ModifierKeyEmitter extends Emitter<IModifierKeyStatus> {

	private readonly _subscriptions = new DisposableStore();
	private _keyStatus: IModifierKeyStatus;
	private static instance: ModifierKeyEmitter;

	private constructor() {
		super();

		this._keyStatus = {
			altKey: false,
			shiftKey: false,
			ctrlKey: false,
			metaKey: false
		};

		this._subscriptions.add(domEvent(window, 'keydown', true)(e => {
			if (e.defaultPrevented) {
				return;
			}

			const event = new StandardKeyboardEvent(e);
			// If Alt-key keydown event is repeated, ignore it #112347
			// Only known to be necessary for Alt-Key at the moment #115810
			if (event.keyCode === KeyCode.Alt && e.repeat) {
				return;
			}

			if (e.altKey && !this._keyStatus.altKey) {
				this._keyStatus.lastKeyPressed = 'alt';
			} else if (e.ctrlKey && !this._keyStatus.ctrlKey) {
				this._keyStatus.lastKeyPressed = 'ctrl';
			} else if (e.metaKey && !this._keyStatus.metaKey) {
				this._keyStatus.lastKeyPressed = 'meta';
			} else if (e.shiftKey && !this._keyStatus.shiftKey) {
				this._keyStatus.lastKeyPressed = 'shift';
			} else if (event.keyCode !== KeyCode.Alt) {
				this._keyStatus.lastKeyPressed = undefined;
			} else {
				return;
			}

			this._keyStatus.altKey = e.altKey;
			this._keyStatus.ctrlKey = e.ctrlKey;
			this._keyStatus.metaKey = e.metaKey;
			this._keyStatus.shiftKey = e.shiftKey;

			if (this._keyStatus.lastKeyPressed) {
				this._keyStatus.event = e;
				this.fire(this._keyStatus);
			}
		}));

		this._subscriptions.add(domEvent(window, 'keyup', true)(e => {
			if (e.defaultPrevented) {
				return;
			}

			if (!e.altKey && this._keyStatus.altKey) {
				this._keyStatus.lastKeyReleased = 'alt';
			} else if (!e.ctrlKey && this._keyStatus.ctrlKey) {
				this._keyStatus.lastKeyReleased = 'ctrl';
			} else if (!e.metaKey && this._keyStatus.metaKey) {
				this._keyStatus.lastKeyReleased = 'meta';
			} else if (!e.shiftKey && this._keyStatus.shiftKey) {
				this._keyStatus.lastKeyReleased = 'shift';
			} else {
				this._keyStatus.lastKeyReleased = undefined;
			}

			if (this._keyStatus.lastKeyPressed !== this._keyStatus.lastKeyReleased) {
				this._keyStatus.lastKeyPressed = undefined;
			}

			this._keyStatus.altKey = e.altKey;
			this._keyStatus.ctrlKey = e.ctrlKey;
			this._keyStatus.metaKey = e.metaKey;
			this._keyStatus.shiftKey = e.shiftKey;

			if (this._keyStatus.lastKeyReleased) {
				this._keyStatus.event = e;
				this.fire(this._keyStatus);
			}
		}));

		this._subscriptions.add(domEvent(document.body, 'mousedown', true)(e => {
			this._keyStatus.lastKeyPressed = undefined;
		}));

		this._subscriptions.add(domEvent(document.body, 'mouseup', true)(e => {
			this._keyStatus.lastKeyPressed = undefined;
		}));

		this._subscriptions.add(domEvent(document.body, 'mousemove', true)(e => {
			if (e.buttons) {
				this._keyStatus.lastKeyPressed = undefined;
			}
		}));

		this._subscriptions.add(domEvent(window, 'blur')(e => {
			this.resetKeyStatus();
		}));
	}

	get keyStatus(): IModifierKeyStatus {
		return this._keyStatus;
	}

	/**
	 * Allows to explicitly reset the key status based on more knowledge (#109062)
	 */
	resetKeyStatus(): void {
		this.doResetKeyStatus();
		this.fire(this._keyStatus);
	}

	private doResetKeyStatus(): void {
		this._keyStatus = {
			altKey: false,
			shiftKey: false,
			ctrlKey: false,
			metaKey: false
		};
	}

	static getInstance() {
		if (!ModifierKeyEmitter.instance) {
			ModifierKeyEmitter.instance = new ModifierKeyEmitter();
		}

		return ModifierKeyEmitter.instance;
	}

	override dispose() {
		super.dispose();
		this._subscriptions.dispose();
	}
}

export function addMatchMediaChangeListener(query: string, callback: () => void): void {
	const mediaQueryList = window.matchMedia(query);
	if (typeof mediaQueryList.addEventListener === 'function') {
		mediaQueryList.addEventListener('change', callback);
	} else {
		// Safari 13.x
		mediaQueryList.addListener(callback);
	}
}
