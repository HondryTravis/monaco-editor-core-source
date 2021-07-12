/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface IProgressIndicator {

	/**
	 * Show progress customized with the provided flags.
	 */
	show(infinite: true, delay?: number): IProgressRunner;
	show(total: number, delay?: number): IProgressRunner;

	/**
	 * Indicate progress for the duration of the provided promise. Progress will stop in
	 * any case of promise completion, error or cancellation.
	 */
	showWhile(promise: Promise<unknown>, delay?: number): Promise<void>;
}

export interface IProgressRunner {
	total(value: number): void;
	worked(value: number): void;
	done(): void;
}

export interface IProgress<T> {
	report(item: T): void;
}

export class Progress<T> implements IProgress<T> {

	static readonly None: IProgress<unknown> = Object.freeze({ report() { } });

	private _value?: T;

	constructor(private callback: (data: T) => void) { }

	report(item: T) {
		this._value = item;
		this.callback(this._value);
	}
}

export const IEditorProgressService = createDecorator<IEditorProgressService>('editorProgressService');

/**
 * A progress service that will report progress local to the editor triggered from.
 */
export interface IEditorProgressService extends IProgressIndicator {

	readonly _serviceBrand: undefined;
}
