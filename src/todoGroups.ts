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

function sortGroupLines(lines: string[], group: TodoGroup): string[] {
	const baseIndent = indentWidth(lines[group.startLine]);
	const items: { lines: string[]; checked: boolean; order: number }[] = [];
	let current: { lines: string[]; checked: boolean; order: number } | undefined;

	const saveCurrent = (): void => {
		if (current) {
			items.push(current);
			current = undefined;
		}
	};

	for (let i = group.startLine; i <= group.endLine; i++) {
		const line = lines[i];

		if (isTodoLine(line) && indentWidth(line) === baseIndent) {
			saveCurrent();

			const checkbox = /^\s*[-*+]\s+\[([ xX])\]/.exec(line);
			current = {
				lines: [line],
				checked: checkbox?.[1].toLowerCase() === 'x',
				order: items.length,
			};
		} else if (current) {
			current.lines.push(line);
		}
	}
	saveCurrent();

	return items
		.sort((a, b) => Number(a.checked) - Number(b.checked) || a.order - b.order)
		.flatMap((item) => item.lines);
}

/** Sorts the top-level todo items in the group containing the given line.
 *
 * Returns the new lines and the group that was sorted, or undefined if there
 * is no group at that line.
 */
export function sortTopLevelGroupAtLine(
    lines: string[],
    cursorLine: number,
): { lines: string[]; group: TodoGroup } | undefined {
    const group = findGroupAtLine(findTodoGroups(lines), cursorLine);
    if (!group) {
        return undefined;
    }

    const replacement = sortGroupLines(lines, group);

    return {
        lines: [
            ...lines.slice(0, group.startLine),
            ...replacement,
            ...lines.slice(group.endLine + 1),
        ],
        group,
    };
}

/** Sorts every todo group independently, preserving all other note lines.
 *
 * Returns the transformed note and the ranges of groups whose contents changed.
 */
export function sortAllTodoGroups(
	lines: string[],
): { lines: string[]; changedGroups: TodoGroup[] } {
	const sortedLines = lines.slice();
	const changedGroups: TodoGroup[] = [];

	for (const group of findTodoGroups(lines)) {
		const replacement = sortGroupLines(lines, group);
		const previous = lines.slice(group.startLine, group.endLine + 1);
		if (
			replacement.length === previous.length &&
			replacement.every((line, index) => line === previous[index])
		) {
			continue;
		}

		sortedLines.splice(group.startLine, previous.length, ...replacement);
		changedGroups.push(group);
	}

	return { lines: sortedLines, changedGroups };
}