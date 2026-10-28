// Matches "- [ ] text", "* [x] text", "+ [X] text" (text optional).
const TODO_REGEX = /^(\s*)([-*+])\s+\[([ xX])\](?:\s+(.*))?$/;

/** Replaces the checkbox state with a space, so two lines can be compared ignoring it. */
function withoutCheckState(line: string): string {
	return line.replace(/\[[ xX]\]/, '[ ]');
}

/** True if the ONLY difference between the two lines is the checkbox being ticked or unticked. */
export function isCheckboxToggle(oldLine: string, newLine: string): boolean {
	const oldMatch = TODO_REGEX.exec(oldLine);
	const newMatch = TODO_REGEX.exec(newLine);
	if (!oldMatch || !newMatch) {
		return false;
	}
	const wasChecked = oldMatch[3] !== ' ';
	const isChecked = newMatch[3] !== ' ';
	if (wasChecked === isChecked) {
		return false;
	}
	return withoutCheckState(oldLine) === withoutCheckState(newLine);
}

/**
 * Compares two versions of a note (as lines) and returns the 0-based indices of
 * lines whose checkbox was toggled. Returns [] if anything else changed as well,
 * so that ordinary editing, undo of a sort, or switching notes never counts.
 */
export function findToggledLines(oldLines: string[], newLines: string[]): number[] {
	if (oldLines.length !== newLines.length) {
		return [];
	}
	const toggled: number[] = [];
	for (let i = 0; i < oldLines.length; i++) {
		if (oldLines[i] === newLines[i]) {
			continue;
		}
		if (!isCheckboxToggle(oldLines[i], newLines[i])) {
			return [];
		}
		toggled.push(i);
	}
	return toggled;
}