// Group detection for todo lists inside a Markdown note.
//
// This file must NOT import anything from 'api' (Joplin), so that it can be
// unit tested on its own.

/**
 * A todo group, described by the lines it covers.
 * Line numbers are 0-based and both ends are inclusive.
 */
export interface TodoGroup {
	startLine: number;
	endLine: number;
}

export interface TodoItem {
	startLine: number;
	endLine: number;
	indent: number;
	checked: boolean;
	children: TodoItem[];
}

export interface TodoLineChange {
	startLine: number;
	endLine: number;
	replacementLines: string[];
}

export interface TodoLineMapping {
	startLine: number;
	endLine: number;
	newStartLine: number;
}

interface Fence {
	char: string;
	length: number;
}

// Matches "- [ ] text", "* [x] text", "+ [X] text" (text is optional).
// Group 1 = indentation, group 2 = bullet, group 3 = checkbox state.
const TODO_REGEX = /^(\s*)([-*+])\s+\[([ xX])\](?:\s+(.*))?$/;

// Matches the start of a fenced code block (three or more ` or ~).
const FENCE_REGEX = /^\s*(`{3,}|~{3,})/;

// A tab counts as this many spaces when measuring indentation.
const TAB_WIDTH = 4;

/** Splits note text into lines, coping with both Windows and Unix line endings. */
export function splitLines(text: string): string[] {
	return text.split(/\r?\n/);
}

/** True if the line is a todo item, e.g. "- [ ] buy milk". */
export function isTodoLine(line: string): boolean {
	return TODO_REGEX.test(line);
}

/** Width of the leading whitespace of a line, with tabs expanded. */
export function indentWidth(line: string): number {
	let width = 0;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (ch === ' ') {
			width += 1;
		} else if (ch === '\t') {
			width += TAB_WIDTH;
		} else {
			break;
		}
	}
	return width;
}

function isBlank(line: string): boolean {
	return line.trim() === '';
}

function isClosingFence(line: string, fence: Fence): boolean {
	const match = FENCE_REGEX.exec(line);
	if (!match) {
		return false;
	}
	const marker = match[1];
	return marker[0] === fence.char && marker.length >= fence.length && line.trim() === marker;
}

/**
 * Finds every todo group in a note.
 *
 * A group starts at a todo line and continues while each following line is:
 *   - a todo line at the same indentation as the first one (a sibling), or
 *   - any non-blank line indented deeper than the first one (a child).
 *
 * A group ends at a blank line, at a line that is not part of the list,
 * at a line indented less than the group, or at a fenced code block.
 */
export function findTodoGroups(lines: string[]): TodoGroup[] {
	const groups: TodoGroup[] = [];

	let fence: Fence | null = null;
	let groupStart = -1; // -1 means "no group is open"
	let groupEnd = -1;
	let groupIndent = 0;

	const closeGroup = (): void => {
		if (groupStart !== -1) {
			groups.push({ startLine: groupStart, endLine: groupEnd });
			groupStart = -1;
		}
	};

	const openGroup = (line: number, indent: number): void => {
		groupStart = line;
		groupEnd = line;
		groupIndent = indent;
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// 1. Inside a fenced code block: ignore everything until it closes.
		if (fence) {
			if (isClosingFence(line, fence)) {
				fence = null;
			}
			continue;
		}

		// 2. Start of a fenced code block: ends any open group.
		const fenceMatch = FENCE_REGEX.exec(line);
		if (fenceMatch) {
			closeGroup();
			fence = { char: fenceMatch[1][0], length: fenceMatch[1].length };
			continue;
		}

		// 3. A blank line always ends a group.
		if (isBlank(line)) {
			closeGroup();
			continue;
		}

		const indent = indentWidth(line);
		const todo = isTodoLine(line);

		// 4. No open group: a todo line starts one, anything else is ignored.
		if (groupStart === -1) {
			if (todo) {
				openGroup(i, indent);
			}
			continue;
		}

		// 5. A group is open: decide whether this line belongs to it.
		if (indent > groupIndent) {
			groupEnd = i; // child content (a sub-task, a sub-bullet, or a note)
		} else if (indent === groupIndent && todo) {
			groupEnd = i; // a sibling todo
		} else {
			closeGroup();
			if (todo) {
				openGroup(i, indent); // e.g. a todo at a shallower indent starts a new group
			}
		}
	}

	closeGroup();
	return groups;
}

/** Returns the group that contains the given line, if any. */
export function findGroupAtLine(groups: TodoGroup[], line: number): TodoGroup | undefined {
	return groups.find((group) => line >= group.startLine && line <= group.endLine);
}

/** Builds the task hierarchy inside a detected group. */
export function findTodoItems(lines: string[], group: TodoGroup): TodoItem[] {
	const roots: TodoItem[] = [];
	const parents: TodoItem[] = [];

	for (let lineIndex = group.startLine; lineIndex <= group.endLine; lineIndex++) {
		const line = lines[lineIndex];
		if (!isTodoLine(line)) {
			continue;
		}

		const indent = indentWidth(line);
		while (parents.length > 0 && parents[parents.length - 1].indent >= indent) {
			parents[parents.length - 1].endLine = lineIndex - 1;
			parents.pop();
		}

		const checkbox = /^\s*[-*+]\s+\[([ xX])\]/.exec(line);
		const item: TodoItem = {
			startLine: lineIndex,
			endLine: group.endLine,
			indent,
			checked: checkbox?.[1].toLowerCase() === 'x',
			children: [],
		};

		if (parents.length > 0) {
			parents[parents.length - 1].children.push(item);
		} else {
			roots.push(item);
		}
		parents.push(item);
	}

	return roots;
}

function sortSiblingItems(lines: string[], items: TodoItem[]): string[] {
	const output: string[] = [];
	let runStart = 0;

	while (runStart < items.length) {
		let runEnd = runStart + 1;
		while (runEnd < items.length && items[runEnd].indent === items[runStart].indent) {
			runEnd++;
		}

		const sortedRun = items.slice(runStart, runEnd).sort(
			(a, b) => Number(a.checked) - Number(b.checked) || a.startLine - b.startLine,
		);
		for (const item of sortedRun) {
			output.push(...renderTodoItem(lines, item));
		}
		runStart = runEnd;
	}

	return output;
}

function renderTodoItem(lines: string[], item: TodoItem): string[] {
	const output = [lines[item.startLine]];
	let nextLine = item.startLine + 1;
	let childIndex = 0;

	while (childIndex < item.children.length) {
		let runEnd = childIndex + 1;
		while (
			runEnd < item.children.length &&
			item.children[runEnd].indent === item.children[childIndex].indent
		) {
			runEnd++;
		}

		const childRun = item.children.slice(childIndex, runEnd);
		const firstChild = childRun[0];
		const lastChild = childRun[childRun.length - 1];
		output.push(...lines.slice(nextLine, firstChild.startLine));
		output.push(...sortSiblingItems(lines, childRun));
		nextLine = lastChild.endLine + 1;
		childIndex = runEnd;
	}

	output.push(...lines.slice(nextLine, item.endLine + 1));
	return output;
}

function sortGroupLines(lines: string[], group: TodoGroup): string[] {
	return sortSiblingItems(lines, findTodoItems(lines, group));
}

function findItemSiblingsAtLine(
	items: TodoItem[],
	line: number,
): { siblings: TodoItem[]; index: number } | undefined {
	for (let index = 0; index < items.length; index++) {
		const item = items[index];
		if (line < item.startLine || line > item.endLine) {
			continue;
		}

		const childResult = findItemSiblingsAtLine(item.children, line);
		if (childResult) {
			return childResult;
		}

		return { siblings: items, index };
	}
	return undefined;
}

function findChangedLineSpan(
	originalLines: string[],
	sortedLines: string[],
	startLine: number,
): TodoLineChange | undefined {
	let prefixLength = 0;
	while (
		prefixLength < originalLines.length &&
		originalLines[prefixLength] === sortedLines[prefixLength]
	) {
		prefixLength++;
	}

	let suffixLength = 0;
	while (
		suffixLength < originalLines.length - prefixLength &&
		suffixLength < sortedLines.length - prefixLength &&
		originalLines[originalLines.length - 1 - suffixLength] ===
			sortedLines[sortedLines.length - 1 - suffixLength]
	) {
		suffixLength++;
	}

	if (prefixLength === originalLines.length && prefixLength === sortedLines.length) {
		return undefined;
	}

	return {
		startLine: startLine + prefixLength,
		endLine: startLine + originalLines.length - suffixLength - 1,
		replacementLines: sortedLines.slice(prefixLength, sortedLines.length - suffixLength),
	};
}

/** Moves the task at the given line one position among its siblings.
 *
 * A task's entire subtree moves with it. Returns undefined when the line is
 * outside a task group, or when the task has no sibling in that direction.
 */
export function moveTodoItemAtLine(
	lines: string[],
	cursorLine: number,
	direction: -1 | 1,
): { lines: string[]; change: TodoLineChange; lineMappings: TodoLineMapping[] } | undefined {
	const group = findGroupAtLine(findTodoGroups(lines), cursorLine);
	if (!group) {
		return undefined;
	}

	const roots = findTodoItems(lines, group);
	const target = findItemSiblingsAtLine(roots, cursorLine);
	if (!target) {
		return undefined;
	}

	const otherIndex = target.index + direction;
	if (otherIndex < 0 || otherIndex >= target.siblings.length) {
		return undefined;
	}

	const originalGroup = lines.slice(group.startLine, group.endLine + 1);
	const firstItem = target.siblings[Math.min(target.index, otherIndex)];
	const secondItem = target.siblings[Math.max(target.index, otherIndex)];
	const firstBlock = lines.slice(firstItem.startLine, firstItem.endLine + 1);
	const secondBlock = lines.slice(secondItem.startLine, secondItem.endLine + 1);
	const movedItem = target.siblings[target.index];
	const otherItem = target.siblings[otherIndex];
	const firstBlockNewStartLine = firstItem.startLine + secondBlock.length;
	const reorderedGroup = originalGroup.slice();
	const relativeStart = firstItem.startLine - group.startLine;
	const relativeEnd = secondItem.endLine - group.startLine + 1;
	const swappedBlocks = [...secondBlock, ...firstBlock];
	reorderedGroup.splice(relativeStart, relativeEnd - relativeStart, ...swappedBlocks);
	const change = findChangedLineSpan(originalGroup, reorderedGroup, group.startLine);
	if (!change) {
		return undefined;
	}

	return {
		lines: [
			...lines.slice(0, group.startLine),
			...reorderedGroup,
			...lines.slice(group.endLine + 1),
		],
		change,
		lineMappings: [
			{
				startLine: movedItem.startLine,
				endLine: movedItem.endLine,
				newStartLine: movedItem === firstItem
					? firstBlockNewStartLine
					: firstItem.startLine,
			},
			{
				startLine: otherItem.startLine,
				endLine: otherItem.endLine,
				newStartLine: otherItem === firstItem
					? firstBlockNewStartLine
					: firstItem.startLine,
			},
		],
	};
}

/** Sorts todo siblings at every level in the group containing the given line.
 *
 * Returns the new lines and the group that was sorted, or undefined if there
 * is no group at that line. `change` describes the smallest contiguous span
 * that needs replacing in the original note.
 */
export function sortTodoGroupAtLine(
	lines: string[],
	cursorLine: number,
): { lines: string[]; group: TodoGroup; change?: TodoLineChange } | undefined {
	const group = findGroupAtLine(findTodoGroups(lines), cursorLine);
	if (!group) {
		return undefined;
	}

	const replacement = sortGroupLines(lines, group);
	const previous = lines.slice(group.startLine, group.endLine + 1);
	const change = findChangedLineSpan(previous, replacement, group.startLine);

	return {
		lines: [
			...lines.slice(0, group.startLine),
			...replacement,
			...lines.slice(group.endLine + 1),
		],
		group,
		change,
	};
}

/** Sorts every todo group independently, preserving all other note lines.
 *
 * Returns the transformed note and the ranges of groups whose contents changed.
 */
export function sortAllTodoGroups(
	lines: string[],
): { lines: string[]; changedGroups: TodoGroup[]; changes: TodoLineChange[] } {
	const sortedLines = lines.slice();
	const changedGroups: TodoGroup[] = [];
	const changes: TodoLineChange[] = [];

	for (const group of findTodoGroups(lines)) {
		const replacement = sortGroupLines(lines, group);
		const previous = lines.slice(group.startLine, group.endLine + 1);
		const change = findChangedLineSpan(previous, replacement, group.startLine);
		if (!change) {
			continue;
		}

		sortedLines.splice(group.startLine, previous.length, ...replacement);
		changedGroups.push(group);
		changes.push(change);
	}

	return { lines: sortedLines, changedGroups, changes };
}