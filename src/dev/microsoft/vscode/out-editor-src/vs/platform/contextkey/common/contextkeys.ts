/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { isWindows } from 'vs/base/common/platform';
export const IsWindowsContext = new RawContextKey<boolean>('isWindows', isWindows, localize('isWindows', "Whether the operating system is Windows"));

export const InputFocusedContextKey = 'inputFocus';
