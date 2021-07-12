/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event, Emitter, PauseableEmitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { isUndefinedOrNull } from 'vs/base/common/types';
import { InMemoryStorageDatabase, IStorage, Storage } from 'vs/base/parts/storage/common/storage';
const TARGET_KEY = '__$__targetStorageMarker';

export const IStorageService = createDecorator<IStorageService>('storageService');

export enum WillSaveStateReason {

	/**
	 * No specific reason to save state.
	 */
	NONE,

	/**
	 * A hint that the workbench is about to shutdown.
	 */
	SHUTDOWN
}

export interface IWillSaveStateEvent {
	reason: WillSaveStateReason;
}

export interface IStorageService {

	readonly _serviceBrand: undefined;

	/**
	 * Emitted when the storage is about to persist. This is the right time
	 * to persist data to ensure it is stored before the application shuts
	 * down.
	 *
	 * The will save state event allows to optionally ask for the reason of
	 * saving the state, e.g. to find out if the state is saved due to a
	 * shutdown.
	 *
	 * Note: this event may be fired many times, not only on shutdown to prevent
	 * loss of state in situations where the shutdown is not sufficient to
	 * persist the data properly.
	 */
	readonly onWillSaveState: Event<IWillSaveStateEvent>;

	/**
	 * Retrieve an element stored with the given key from storage. Use
	 * the provided `defaultValue` if the element is `null` or `undefined`.
	 *
	 * @param scope allows to define the scope of the storage operation
	 * to either the current workspace only or all workspaces.
	 */
	get(key: string, scope: StorageScope, fallbackValue: string): string;
	get(key: string, scope: StorageScope, fallbackValue?: string): string | undefined;

	/**
	 * Retrieve an element stored with the given key from storage. Use
	 * the provided `defaultValue` if the element is `null` or `undefined`.
	 * The element will be converted to a `boolean`.
	 *
	 * @param scope allows to define the scope of the storage operation
	 * to either the current workspace only or all workspaces.
	 */
	getBoolean(key: string, scope: StorageScope, fallbackValue: boolean): boolean;
	getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): boolean | undefined;

	/**
	 * Retrieve an element stored with the given key from storage. Use
	 * the provided `defaultValue` if the element is `null` or `undefined`.
	 * The element will be converted to a `number` using `parseInt` with a
	 * base of `10`.
	 *
	 * @param scope allows to define the scope of the storage operation
	 * to either the current workspace only or all workspaces.
	 */
	getNumber(key: string, scope: StorageScope, fallbackValue: number): number;
	getNumber(key: string, scope: StorageScope, fallbackValue?: number): number | undefined;

	/**
	 * Store a value under the given key to storage. The value will be
	 * converted to a `string`. Storing either `undefined` or `null` will
	 * remove the entry under the key.
	 *
	 * @param scope allows to define the scope of the storage operation
	 * to either the current workspace only or all workspaces.
	 *
	 * @param target allows to define the target of the storage operation
	 * to either the current machine or user.
	 */
	store(key: string, value: string | boolean | number | undefined | null, scope: StorageScope, target: StorageTarget): void;

	/**
	 * Delete an element stored under the provided key from storage.
	 *
	 * The scope argument allows to define the scope of the storage
	 * operation to either the current workspace only or all workspaces.
	 */
	remove(key: string, scope: StorageScope): void;
}

export const enum StorageScope {

	/**
	 * The stored data will be scoped to all workspaces.
	 */
	GLOBAL,

	/**
	 * The stored data will be scoped to the current workspace.
	 */
	WORKSPACE
}

export const enum StorageTarget {

	/**
	 * The stored data is user specific and applies across machines.
	 */
	USER,

	/**
	 * The stored data is machine specific.
	 */
	MACHINE
}

export interface IStorageValueChangeEvent {

	/**
	 * The scope for the storage entry that changed
	 * or was removed.
	 */
	readonly scope: StorageScope;

	/**
	 * The `key` of the storage entry that was changed
	 * or was removed.
	 */
	readonly key: string;

	/**
	 * The `target` can be `undefined` if a key is being
	 * removed.
	 */
	readonly target: StorageTarget | undefined;
}

export interface IStorageTargetChangeEvent {

	/**
	 * The scope for the target that changed. Listeners
	 * should use `keys(scope, target)` to get an updated
	 * list of keys for the given `scope` and `target`.
	 */
	readonly scope: StorageScope;
}

interface IKeyTargets {
	[key: string]: StorageTarget
}

export interface IStorageServiceOptions {
	flushInterval: number;
}

export abstract class AbstractStorageService extends Disposable implements IStorageService {

	declare readonly _serviceBrand: undefined;

	private static DEFAULT_FLUSH_INTERVAL = 60 * 1000; // every minute

	private readonly _onDidChangeValue = this._register(new PauseableEmitter<IStorageValueChangeEvent>());

	private readonly _onDidChangeTarget = this._register(new PauseableEmitter<IStorageTargetChangeEvent>());

	private readonly _onWillSaveState = this._register(new Emitter<IWillSaveStateEvent>());
	readonly onWillSaveState = this._onWillSaveState.event;

	constructor(private options: IStorageServiceOptions = { flushInterval: AbstractStorageService.DEFAULT_FLUSH_INTERVAL }) {
		super();
	}

	protected emitDidChangeValue(scope: StorageScope, key: string): void {

		// Specially handle `TARGET_KEY`
		if (key === TARGET_KEY) {

			// Clear our cached version which is now out of date
			if (scope === StorageScope.GLOBAL) {
				this._globalKeyTargets = undefined;
			} else if (scope === StorageScope.WORKSPACE) {
				this._workspaceKeyTargets = undefined;
			}

			// Emit as `didChangeTarget` event
			this._onDidChangeTarget.fire({ scope });
		}

		// Emit any other key to outside
		else {
			this._onDidChangeValue.fire({ scope, key, target: this.getKeyTargets(scope)[key] });
		}
	}

	get(key: string, scope: StorageScope, fallbackValue: string): string;
	get(key: string, scope: StorageScope): string | undefined;
	get(key: string, scope: StorageScope, fallbackValue?: string): string | undefined {
		return this.getStorage(scope)?.get(key, fallbackValue);
	}

	getBoolean(key: string, scope: StorageScope, fallbackValue: boolean): boolean;
	getBoolean(key: string, scope: StorageScope): boolean | undefined;
	getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): boolean | undefined {
		return this.getStorage(scope)?.getBoolean(key, fallbackValue);
	}

	getNumber(key: string, scope: StorageScope, fallbackValue: number): number;
	getNumber(key: string, scope: StorageScope): number | undefined;
	getNumber(key: string, scope: StorageScope, fallbackValue?: number): number | undefined {
		return this.getStorage(scope)?.getNumber(key, fallbackValue);
	}

	store(key: string, value: string | boolean | number | undefined | null, scope: StorageScope, target: StorageTarget): void {

		// We remove the key for undefined/null values
		if (isUndefinedOrNull(value)) {
			this.remove(key, scope);
			return;
		}

		// Update our datastructures but send events only after
		this.withPausedEmitters(() => {

			// Update key-target map
			this.updateKeyTarget(key, scope, target);

			// Store actual value
			this.getStorage(scope)?.set(key, value);
		});
	}

	remove(key: string, scope: StorageScope): void {

		// Update our datastructures but send events only after
		this.withPausedEmitters(() => {

			// Update key-target map
			this.updateKeyTarget(key, scope, undefined);

			// Remove actual key
			this.getStorage(scope)?.delete(key);
		});
	}

	private withPausedEmitters(fn: Function): void {

		// Pause emitters
		this._onDidChangeValue.pause();
		this._onDidChangeTarget.pause();

		try {
			fn();
		} finally {

			// Resume emitters
			this._onDidChangeValue.resume();
			this._onDidChangeTarget.resume();
		}
	}

	private updateKeyTarget(key: string, scope: StorageScope, target: StorageTarget | undefined): void {

		// Add
		const keyTargets = this.getKeyTargets(scope);
		if (typeof target === 'number') {
			if (keyTargets[key] !== target) {
				keyTargets[key] = target;
				this.getStorage(scope)?.set(TARGET_KEY, JSON.stringify(keyTargets));
			}
		}

		// Remove
		else {
			if (typeof keyTargets[key] === 'number') {
				delete keyTargets[key];
				this.getStorage(scope)?.set(TARGET_KEY, JSON.stringify(keyTargets));
			}
		}
	}

	private _workspaceKeyTargets: IKeyTargets | undefined = undefined;
	private get workspaceKeyTargets(): IKeyTargets {
		if (!this._workspaceKeyTargets) {
			this._workspaceKeyTargets = this.loadKeyTargets(StorageScope.WORKSPACE);
		}

		return this._workspaceKeyTargets;
	}

	private _globalKeyTargets: IKeyTargets | undefined = undefined;
	private get globalKeyTargets(): IKeyTargets {
		if (!this._globalKeyTargets) {
			this._globalKeyTargets = this.loadKeyTargets(StorageScope.GLOBAL);
		}

		return this._globalKeyTargets;
	}

	private getKeyTargets(scope: StorageScope): IKeyTargets {
		return scope === StorageScope.GLOBAL ? this.globalKeyTargets : this.workspaceKeyTargets;
	}

	private loadKeyTargets(scope: StorageScope): { [key: string]: StorageTarget } {
		const keysRaw = this.get(TARGET_KEY, scope);
		if (keysRaw) {
			try {
				return JSON.parse(keysRaw);
			} catch (error) {
				// Fail gracefully
			}
		}

		return Object.create(null);
	}

	protected abstract getStorage(scope: StorageScope): IStorage | undefined;
}

export class InMemoryStorageService extends AbstractStorageService {

	private globalStorage = new Storage(new InMemoryStorageDatabase());
	private workspaceStorage = new Storage(new InMemoryStorageDatabase());

	constructor() {
		super();

		this._register(this.workspaceStorage.onDidChangeStorage(key => this.emitDidChangeValue(StorageScope.WORKSPACE, key)));
		this._register(this.globalStorage.onDidChangeStorage(key => this.emitDidChangeValue(StorageScope.GLOBAL, key)));
	}

	protected getStorage(scope: StorageScope): IStorage {
		return scope === StorageScope.GLOBAL ? this.globalStorage : this.workspaceStorage;
	}
}
