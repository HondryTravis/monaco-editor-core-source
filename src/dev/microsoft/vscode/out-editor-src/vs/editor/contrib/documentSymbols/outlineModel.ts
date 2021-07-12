/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from 'vs/base/common/arrays';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { LRUCache } from 'vs/base/common/map';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { DocumentSymbol, DocumentSymbolProvider, DocumentSymbolProviderRegistry } from 'vs/editor/common/modes';
import { Iterable } from 'vs/base/common/iterator';
import { LanguageFeatureRequestDelays } from 'vs/editor/common/modes/languageFeatureRegistry';
import { URI } from 'vs/base/common/uri';

export abstract class TreeElement {

	abstract id: string;
	abstract children: Map<string, TreeElement>;
	abstract parent: TreeElement | undefined;

	remove(): void {
		if (this.parent) {
			this.parent.children.delete(this.id);
		}
	}

	static findId(candidate: DocumentSymbol | string, container: TreeElement): string {
		// complex id-computation which contains the origin/extension,
		// the parent path, and some dedupe logic when names collide
		let candidateId: string;
		if (typeof candidate === 'string') {
			candidateId = `${container.id}/${candidate}`;
		} else {
			candidateId = `${container.id}/${candidate.name}`;
			if (container.children.get(candidateId) !== undefined) {
				candidateId = `${container.id}/${candidate.name}_${candidate.range.startLineNumber}_${candidate.range.startColumn}`;
			}
		}

		let id = candidateId;
		for (let i = 0; container.children.get(id) !== undefined; i++) {
			id = `${candidateId}_${i}`;
		}

		return id;
	}

	static empty(element: TreeElement): boolean {
		return element.children.size === 0;
	}
}

export class OutlineElement extends TreeElement {

	children = new Map<string, OutlineElement>();

	constructor(
		readonly id: string,
		public parent: TreeElement | undefined,
		readonly symbol: DocumentSymbol
	) {
		super();
	}
}

export class OutlineGroup extends TreeElement {

	children = new Map<string, OutlineElement>();

	constructor(
		readonly id: string,
		public parent: TreeElement | undefined,
		readonly label: string,
		readonly order: number,
	) {
		super();
	}
}

export class OutlineModel extends TreeElement {

	private static readonly _requestDurations = new LanguageFeatureRequestDelays(DocumentSymbolProviderRegistry, 350);
	private static readonly _requests = new LRUCache<string, { promiseCnt: number, source: CancellationTokenSource, promise: Promise<any>, model: OutlineModel | undefined }>(9, 0.75);
	private static readonly _keys = new class {

		private _counter = 1;
		private _data = new WeakMap<DocumentSymbolProvider, number>();

		for(textModel: ITextModel, version: boolean): string {
			return `${textModel.id}/${version ? textModel.getVersionId() : ''}/${this._hash(DocumentSymbolProviderRegistry.all(textModel))}`;
		}

		private _hash(providers: DocumentSymbolProvider[]): string {
			let result = '';
			for (const provider of providers) {
				let n = this._data.get(provider);
				if (typeof n === 'undefined') {
					n = this._counter++;
					this._data.set(provider, n);
				}
				result += n;
			}
			return result;
		}
	};


	static create(textModel: ITextModel, token: CancellationToken): Promise<OutlineModel> {

		let key = this._keys.for(textModel, true);
		let data = OutlineModel._requests.get(key);

		if (!data) {
			let source = new CancellationTokenSource();
			data = {
				promiseCnt: 0,
				source,
				promise: OutlineModel._create(textModel, source.token),
				model: undefined,
			};
			OutlineModel._requests.set(key, data);

			// keep moving average of request durations
			const now = Date.now();
			data.promise.then(() => {
				this._requestDurations.update(textModel, Date.now() - now);
			});
		}

		if (data!.model) {
			// resolved -> return data
			return Promise.resolve(data.model!);
		}

		// increase usage counter
		data!.promiseCnt += 1;

		token.onCancellationRequested(() => {
			// last -> cancel provider request, remove cached promise
			if (--data!.promiseCnt === 0) {
				data!.source.cancel();
				OutlineModel._requests.delete(key);
			}
		});

		return new Promise((resolve, reject) => {
			data!.promise.then(model => {
				data!.model = model;
				resolve(model);
			}, err => {
				OutlineModel._requests.delete(key);
				reject(err);
			});
		});
	}

	private static _create(textModel: ITextModel, token: CancellationToken): Promise<OutlineModel> {

		const cts = new CancellationTokenSource(token);
		const result = new OutlineModel(textModel.uri);
		const provider = DocumentSymbolProviderRegistry.ordered(textModel);
		const promises = provider.map((provider, index) => {

			let id = TreeElement.findId(`provider_${index}`, result);
			let group = new OutlineGroup(id, result, provider.displayName ?? 'Unknown Outline Provider', index);

			return Promise.resolve(provider.provideDocumentSymbols(textModel, cts.token)).then(result => {
				for (const info of result || []) {
					OutlineModel._makeOutlineElement(info, group);
				}
				return group;
			}, err => {
				onUnexpectedExternalError(err);
				return group;
			}).then(group => {
				if (!TreeElement.empty(group)) {
					result._groups.set(id, group);
				} else {
					group.remove();
				}
			});
		});

		const listener = DocumentSymbolProviderRegistry.onDidChange(() => {
			const newProvider = DocumentSymbolProviderRegistry.ordered(textModel);
			if (!equals(newProvider, provider)) {
				cts.cancel();
			}
		});

		return Promise.all(promises).then(() => {
			if (cts.token.isCancellationRequested && !token.isCancellationRequested) {
				return OutlineModel._create(textModel, token);
			} else {
				return result._compact();
			}
		}).finally(() => {
			listener.dispose();
		});
	}

	private static _makeOutlineElement(info: DocumentSymbol, container: OutlineGroup | OutlineElement): void {
		let id = TreeElement.findId(info, container);
		let res = new OutlineElement(id, container, info);
		if (info.children) {
			for (const childInfo of info.children) {
				OutlineModel._makeOutlineElement(childInfo, res);
			}
		}
		container.children.set(res.id, res);
	}

	readonly id = 'root';
	readonly parent = undefined;

	protected _groups = new Map<string, OutlineGroup>();
	children = new Map<string, OutlineGroup | OutlineElement>();

	protected constructor(readonly uri: URI) {
		super();

		this.id = 'root';
		this.parent = undefined;
	}

	private _compact(): this {
		let count = 0;
		for (const [key, group] of this._groups) {
			if (group.children.size === 0) { // empty
				this._groups.delete(key);
			} else {
				count += 1;
			}
		}
		if (count !== 1) {
			//
			this.children = this._groups;
		} else {
			// adopt all elements of the first group
			let group = Iterable.first(this._groups.values())!;
			for (let [, child] of group.children) {
				child.parent = this;
				this.children.set(child.id, child);
			}
		}
		return this;
	}

	getTopLevelSymbols(): DocumentSymbol[] {
		const roots: DocumentSymbol[] = [];
		for (const child of this.children.values()) {
			if (child instanceof OutlineElement) {
				roots.push(child.symbol);
			} else {
				roots.push(...Iterable.map(child.children.values(), child => child.symbol));
			}
		}
		return roots.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));
	}

	asListOfDocumentSymbols(): DocumentSymbol[] {
		const roots = this.getTopLevelSymbols();
		const bucket: DocumentSymbol[] = [];
		OutlineModel._flattenDocumentSymbols(bucket, roots, '');
		return bucket.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));
	}

	private static _flattenDocumentSymbols(bucket: DocumentSymbol[], entries: DocumentSymbol[], overrideContainerLabel: string): void {
		for (const entry of entries) {
			bucket.push({
				kind: entry.kind,
				tags: entry.tags,
				name: entry.name,
				detail: entry.detail,
				containerName: entry.containerName || overrideContainerLabel,
				range: entry.range,
				selectionRange: entry.selectionRange,
				children: undefined, // we flatten it...
			});

			// Recurse over children
			if (entry.children) {
				OutlineModel._flattenDocumentSymbols(bucket, entry.children, entry.name);
			}
		}
	}
}
