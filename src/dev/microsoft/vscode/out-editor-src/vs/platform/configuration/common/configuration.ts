
import { URI, UriComponents } from 'vs/base/common/uri';
import { Event } from 'vs/base/common/event';
import { Registry } from 'vs/platform/registry/common/platform';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';

export const IConfigurationService = createDecorator<IConfigurationService>('configurationService');

export interface IConfigurationOverrides {
	overrideIdentifier?: string | null;
	resource?: URI | null;
}

export const enum ConfigurationTarget {
	USER = 1,
	USER_LOCAL,
	USER_REMOTE,
	WORKSPACE,
	WORKSPACE_FOLDER,
	DEFAULT,
	MEMORY
}

export interface IConfigurationChange {
	keys: string[];
	overrides: [string, string[]][];
}

export interface IConfigurationChangeEvent {

	readonly source: ConfigurationTarget;
	readonly affectedKeys: string[];

	affectsConfiguration(configuration: string, overrides?: IConfigurationOverrides): boolean;
}

export interface IConfigurationService {
	readonly _serviceBrand: undefined;

	onDidChangeConfiguration: Event<IConfigurationChangeEvent>;

	/**
	 * Fetches the value of the section for the given overrides.
	 * Value can be of native type or an object keyed off the section name.
	 *
	 * @param section - Section of the configuraion. Can be `null` or `undefined`.
	 * @param overrides - Overrides that has to be applied while fetching
	 *
	 */
	getValue<T>(): T;
	getValue<T>(section: string): T;
	getValue<T>(overrides: IConfigurationOverrides): T;
	getValue<T>(section: string, overrides: IConfigurationOverrides): T;
}

export interface IConfigurationModel {
	contents: any;
	keys: string[];
	overrides: IOverrides[];
}

export interface IOverrides {
	keys: string[];
	contents: any;
	identifiers: string[];
}

export interface IConfigurationData {
	defaults: IConfigurationModel;
	user: IConfigurationModel;
	workspace: IConfigurationModel;
	folders: [UriComponents, IConfigurationModel][];
}

export function toValuesTree(properties: { [qualifiedKey: string]: any }, conflictReporter: (message: string) => void): any {
	const root = Object.create(null);

	for (let key in properties) {
		addToValueTree(root, key, properties[key], conflictReporter);
	}

	return root;
}

export function addToValueTree(settingsTreeRoot: any, key: string, value: any, conflictReporter: (message: string) => void): void {
	const segments = key.split('.');
	const last = segments.pop()!;

	let curr = settingsTreeRoot;
	for (let i = 0; i < segments.length; i++) {
		let s = segments[i];
		let obj = curr[s];
		switch (typeof obj) {
			case 'undefined':
				obj = curr[s] = Object.create(null);
				break;
			case 'object':
				break;
			default:
				conflictReporter(`Ignoring ${key} as ${segments.slice(0, i + 1).join('.')} is ${JSON.stringify(obj)}`);
				return;
		}
		curr = obj;
	}

	if (typeof curr === 'object' && curr !== null) {
		try {
			curr[last] = value; // workaround https://github.com/microsoft/vscode/issues/13606
		} catch (e) {
			conflictReporter(`Ignoring ${key} as ${segments.join('.')} is ${JSON.stringify(curr)}`);
		}
	} else {
		conflictReporter(`Ignoring ${key} as ${segments.join('.')} is ${JSON.stringify(curr)}`);
	}
}

export function removeFromValueTree(valueTree: any, key: string): void {
	const segments = key.split('.');
	doRemoveFromValueTree(valueTree, segments);
}

function doRemoveFromValueTree(valueTree: any, segments: string[]): void {
	const first = segments.shift()!;
	if (segments.length === 0) {
		// Reached last segment
		delete valueTree[first];
		return;
	}

	if (Object.keys(valueTree).indexOf(first) !== -1) {
		const value = valueTree[first];
		if (typeof value === 'object' && !Array.isArray(value)) {
			doRemoveFromValueTree(value, segments);
			if (Object.keys(value).length === 0) {
				delete valueTree[first];
			}
		}
	}
}

/**
 * A helper function to get the configuration value with a specific settings path (e.g. config.some.setting)
 */
export function getConfigurationValue<T>(config: any, settingPath: string, defaultValue?: T): T {
	function accessSetting(config: any, path: string[]): any {
		let current = config;
		for (const component of path) {
			if (typeof current !== 'object' || current === null) {
				return undefined;
			}
			current = current[component];
		}
		return <T>current;
	}

	const path = settingPath.split('.');
	const result = accessSetting(config, path);

	return typeof result === 'undefined' ? defaultValue : result;
}

export function getConfigurationKeys(): string[] {
	const properties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
	return Object.keys(properties);
}

export function getDefaultValues(): any {
	const valueTreeRoot: any = Object.create(null);
	const properties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();

	for (let key in properties) {
		let value = properties[key].default;
		addToValueTree(valueTreeRoot, key, value, message => console.error(`Conflict in default settings: ${message}`));
	}

	return valueTreeRoot;
}
