

// Common data transfers
export const DataTransfers = {

	/**
	 * Application specific resource transfer type
	 */
	RESOURCES: 'ResourceURLs',

	/**
	 * Browser specific transfer type to download
	 */
	DOWNLOAD_URL: 'DownloadURL',

	/**
	 * Browser specific transfer type for files
	 */
	FILES: 'Files',

	/**
	 * Typically transfer type for copy/paste transfers.
	 */
	TEXT: 'text/plain'
};

export interface IDragAndDropData {
	update(dataTransfer: DataTransfer): void;
	getData(): unknown;
}

export class DragAndDropData<T> implements IDragAndDropData {

	constructor(private data: T) { }

	update(): void {
		// noop
	}

	getData(): T {
		return this.data;
	}
}

export interface IStaticDND {
	CurrentDragAndDropData: IDragAndDropData | undefined;
}

export const StaticDND: IStaticDND = {
	CurrentDragAndDropData: undefined
};
