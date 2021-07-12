/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

export class MovingAverage {

	private _n = 1;
	private _val = 0;

	update(value: number): this {
		this._val = this._val + (value - this._val) / this._n;
		this._n += 1;
		return this;
	}

	get value(): number {
		return this._val;
	}
}
