
import { IMatch, fuzzyScore, createMatches as createFuzzyMatches } from 'vs/base/common/filters';
import { sep } from 'vs/base/common/path';
import { isWindows } from 'vs/base/common/platform';
import { stripWildcards } from 'vs/base/common/strings';

// function printMatrix(query: string, target: string, matches: number[], scores: number[]): void {
// 	console.log('\t' + target.split('').join('\t'));
// 	for (let queryIndex = 0; queryIndex < query.length; queryIndex++) {
// 		let line = query[queryIndex] + '\t';
// 		for (let targetIndex = 0; targetIndex < target.length; targetIndex++) {
// 			const currentIndex = queryIndex * target.length + targetIndex;
// 			line = line + 'M' + matches[currentIndex] + '/' + 'S' + scores[currentIndex] + '\t';
// 		}

// 		console.log(line);
// 	}
// }

//#endregion


//#region Alternate fuzzy scorer implementation that is e.g. used for symbols

export type FuzzyScore2 = [number | undefined /* score */, IMatch[]];

const NO_SCORE2: FuzzyScore2 = [undefined, []];

export function scoreFuzzy2(target: string, query: IPreparedQuery | IPreparedQueryPiece, patternStart = 0, wordStart = 0): FuzzyScore2 {

	// Score: multiple inputs
	const preparedQuery = query as IPreparedQuery;
	if (preparedQuery.values && preparedQuery.values.length > 1) {
		return doScoreFuzzy2Multiple(target, preparedQuery.values, patternStart, wordStart);
	}

	// Score: single input
	return doScoreFuzzy2Single(target, query, patternStart, wordStart);
}

function doScoreFuzzy2Multiple(target: string, query: IPreparedQueryPiece[], patternStart: number, wordStart: number): FuzzyScore2 {
	let totalScore = 0;
	const totalMatches: IMatch[] = [];

	for (const queryPiece of query) {
		const [score, matches] = doScoreFuzzy2Single(target, queryPiece, patternStart, wordStart);
		if (typeof score !== 'number') {
			// if a single query value does not match, return with
			// no score entirely, we require all queries to match
			return NO_SCORE2;
		}

		totalScore += score;
		totalMatches.push(...matches);
	}

	// if we have a score, ensure that the positions are
	// sorted in ascending order and distinct
	return [totalScore, normalizeMatches(totalMatches)];
}

function doScoreFuzzy2Single(target: string, query: IPreparedQueryPiece, patternStart: number, wordStart: number): FuzzyScore2 {
	const score = fuzzyScore(query.original, query.originalLowercase, patternStart, target, target.toLowerCase(), wordStart, true);
	if (!score) {
		return NO_SCORE2;
	}

	return [score[0], createFuzzyMatches(score)];
}

function normalizeMatches(matches: IMatch[]): IMatch[] {

	// sort matches by start to be able to normalize
	const sortedMatches = matches.sort((matchA, matchB) => {
		return matchA.start - matchB.start;
	});

	// merge matches that overlap
	const normalizedMatches: IMatch[] = [];
	let currentMatch: IMatch | undefined = undefined;
	for (const match of sortedMatches) {

		// if we have no current match or the matches
		// do not overlap, we take it as is and remember
		// it for future merging
		if (!currentMatch || !matchOverlaps(currentMatch, match)) {
			currentMatch = match;
			normalizedMatches.push(match);
		}

		// otherwise we merge the matches
		else {
			currentMatch.start = Math.min(currentMatch.start, match.start);
			currentMatch.end = Math.max(currentMatch.end, match.end);
		}
	}

	return normalizedMatches;
}

function matchOverlaps(matchA: IMatch, matchB: IMatch): boolean {
	if (matchA.end < matchB.start) {
		return false;	// A ends before B starts
	}

	if (matchB.end < matchA.start) {
		return false; // B ends before A starts
	}

	return true;
}

//#endregion


//#region Query Normalizer

export interface IPreparedQueryPiece {

	/**
	 * The original query as provided as input.
	 */
	original: string;
	originalLowercase: string;

	/**
	 * Original normalized to platform separators:
	 * - Windows: \
	 * - Posix: /
	 */
	pathNormalized: string;

	/**
	 * In addition to the normalized path, will have
	 * whitespace and wildcards removed.
	 */
	normalized: string;
	normalizedLowercase: string;
}

export interface IPreparedQuery extends IPreparedQueryPiece {

	/**
	 * Query split by spaces into pieces.
	 */
	values: IPreparedQueryPiece[] | undefined;

	/**
	 * Whether the query contains path separator(s) or not.
	 */
	containsPathSeparator: boolean;
}

/**
 * Helper function to prepare a search value for scoring by removing unwanted characters
 * and allowing to score on multiple pieces separated by whitespace character.
 */
const MULTIPLE_QUERY_VALUES_SEPARATOR = ' ';
export function prepareQuery(original: string): IPreparedQuery {
	if (typeof original !== 'string') {
		original = '';
	}

	const originalLowercase = original.toLowerCase();
	const { pathNormalized, normalized, normalizedLowercase } = normalizeQuery(original);
	const containsPathSeparator = pathNormalized.indexOf(sep) >= 0;

	let values: IPreparedQueryPiece[] | undefined = undefined;

	const originalSplit = original.split(MULTIPLE_QUERY_VALUES_SEPARATOR);
	if (originalSplit.length > 1) {
		for (const originalPiece of originalSplit) {
			const {
				pathNormalized: pathNormalizedPiece,
				normalized: normalizedPiece,
				normalizedLowercase: normalizedLowercasePiece
			} = normalizeQuery(originalPiece);

			if (normalizedPiece) {
				if (!values) {
					values = [];
				}

				values.push({
					original: originalPiece,
					originalLowercase: originalPiece.toLowerCase(),
					pathNormalized: pathNormalizedPiece,
					normalized: normalizedPiece,
					normalizedLowercase: normalizedLowercasePiece
				});
			}
		}
	}

	return { original, originalLowercase, pathNormalized, normalized, normalizedLowercase, values, containsPathSeparator };
}

function normalizeQuery(original: string): { pathNormalized: string, normalized: string, normalizedLowercase: string } {
	let pathNormalized: string;
	if (isWindows) {
		pathNormalized = original.replace(/\//g, sep); // Help Windows users to search for paths when using slash
	} else {
		pathNormalized = original.replace(/\\/g, sep); // Help macOS/Linux users to search for paths when using backslash
	}

	const normalized = stripWildcards(pathNormalized).replace(/\s/g, '');

	return {
		pathNormalized,
		normalized,
		normalizedLowercase: normalized.toLowerCase()
	};
}

export function pieceToQuery(piece: IPreparedQueryPiece): IPreparedQuery;
export function pieceToQuery(pieces: IPreparedQueryPiece[]): IPreparedQuery;
export function pieceToQuery(arg1: IPreparedQueryPiece | IPreparedQueryPiece[]): IPreparedQuery {
	if (Array.isArray(arg1)) {
		return prepareQuery(arg1.map(piece => piece.original).join(MULTIPLE_QUERY_VALUES_SEPARATOR));
	}

	return prepareQuery(arg1.original);
}

//#endregion
