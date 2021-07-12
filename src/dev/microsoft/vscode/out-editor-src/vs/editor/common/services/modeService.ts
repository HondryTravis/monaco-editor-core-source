/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { IMode, LanguageId, LanguageIdentifier } from 'vs/editor/common/modes';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IModeService = createDecorator<IModeService>('modeService');

export interface ILanguageExtensionPoint {
	id: string;
	extensions?: string[];
	filenames?: string[];
	filenamePatterns?: string[];
	firstLine?: string;
	aliases?: string[];
	mimetypes?: string[];
	configuration?: URI;
}

export interface ILanguageSelection {
	readonly languageIdentifier: LanguageIdentifier;
	readonly onDidChange: Event<LanguageIdentifier>;
}

export interface IModeService {
	readonly _serviceBrand: undefined;

	onDidCreateMode: Event<IMode>;

	// --- reading
	isRegisteredMode(mimetypeOrModeId: string): boolean;
	getModeIdForLanguageName(alias: string): string | null;
	getModeIdByFilepathOrFirstLine(resource: URI, firstLine?: string): string | null;
	getModeId(commaSeparatedMimetypesOrCommaSeparatedIds: string): string | null;
	getLanguageIdentifier(modeId: string | LanguageId): LanguageIdentifier | null;

	// --- instantiation
	create(commaSeparatedMimetypesOrCommaSeparatedIds: string | undefined): ILanguageSelection;
	createByFilepathOrFirstLine(resource: URI | null, firstLine?: string): ILanguageSelection;

	triggerMode(commaSeparatedMimetypesOrCommaSeparatedIds: string): void;
}
