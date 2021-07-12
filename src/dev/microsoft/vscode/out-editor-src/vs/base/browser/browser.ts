/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';

class WindowManager {

	public static readonly INSTANCE = new WindowManager();

	// --- Zoom Level
	private _zoomLevel: number = 0;
	private _lastZoomLevelChangeTime: number = 0;
	private readonly _onDidChangeZoomLevel = new Emitter<number>();

	public readonly onDidChangeZoomLevel: Event<number> = this._onDidChangeZoomLevel.event;
	public getZoomLevel(): number {
		return this._zoomLevel;
	}
	public getTimeSinceLastZoomLevelChanged(): number {
		return Date.now() - this._lastZoomLevelChangeTime;
	}

	// --- Zoom Factor
	private _zoomFactor: number = 1;

	public getZoomFactor(): number {
		return this._zoomFactor;
	}

	// --- Pixel Ratio
	public getPixelRatio(): number {
		let ctx: any = document.createElement('canvas').getContext('2d');
		let dpr = window.devicePixelRatio || 1;
		let bsr = ctx.webkitBackingStorePixelRatio ||
			ctx.mozBackingStorePixelRatio ||
			ctx.msBackingStorePixelRatio ||
			ctx.oBackingStorePixelRatio ||
			ctx.backingStorePixelRatio || 1;
		return dpr / bsr;
	}
}
export function getZoomLevel(): number {
	return WindowManager.INSTANCE.getZoomLevel();
}
/** Returns the time (in ms) since the zoom level was changed */
export function getTimeSinceLastZoomLevelChanged(): number {
	return WindowManager.INSTANCE.getTimeSinceLastZoomLevelChanged();
}
export function onDidChangeZoomLevel(callback: (zoomLevel: number) => void): IDisposable {
	return WindowManager.INSTANCE.onDidChangeZoomLevel(callback);
}

/** The zoom scale for an index, e.g. 1, 1.2, 1.4 */
export function getZoomFactor(): number {
	return WindowManager.INSTANCE.getZoomFactor();
}

export function getPixelRatio(): number {
	return WindowManager.INSTANCE.getPixelRatio();
}

const userAgent = navigator.userAgent;

export const isFirefox = (userAgent.indexOf('Firefox') >= 0);
export const isWebKit = (userAgent.indexOf('AppleWebKit') >= 0);
export const isChrome = (userAgent.indexOf('Chrome') >= 0);
export const isSafari = (!isChrome && (userAgent.indexOf('Safari') >= 0));
export const isWebkitWebView = (!isChrome && !isSafari && isWebKit);
export const isAndroid = (userAgent.indexOf('Android') >= 0);
export const isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
