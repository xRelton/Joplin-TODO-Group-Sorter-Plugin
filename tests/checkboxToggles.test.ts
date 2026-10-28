import { describe, it, expect } from 'vitest';
import { isCheckboxToggle, findToggledLines } from '../src/checkboxToggles';

describe('isCheckboxToggle', () => {
	it('detects ticking and unticking', () => {
		expect(isCheckboxToggle('- [ ] milk', '- [x] milk')).toBe(true);
		expect(isCheckboxToggle('- [x] milk', '- [ ] milk')).toBe(true);
		expect(isCheckboxToggle('  * [ ] milk', '  * [X] milk')).toBe(true);
	});
	it('ignores x to X (no real change in state)', () => {
		expect(isCheckboxToggle('- [x] milk', '- [X] milk')).toBe(false);
	});
	it('ignores text edits, even alongside a tick', () => {
		expect(isCheckboxToggle('- [ ] milk', '- [x] milks')).toBe(false);
		expect(isCheckboxToggle('- [ ] milk', '- [ ] milks')).toBe(false);
	});
	it('ignores non-todo lines', () => {
		expect(isCheckboxToggle('- milk', '- [x] milk')).toBe(false);
	});
});

describe('findToggledLines', () => {
	const before = ['- [ ] a', '- [ ] b', '', '- [ ] c'];

	it('finds a single toggle', () => {
		const after = ['- [ ] a', '- [x] b', '', '- [ ] c'];
		expect(findToggledLines(before, after)).toEqual([1]);
	});
	it('finds several toggles in one change', () => {
		const after = ['- [x] a', '- [ ] b', '', '- [x] c'];
		expect(findToggledLines(before, after)).toEqual([0, 3]);
	});
	it('returns [] when nothing changed', () => {
		expect(findToggledLines(before, [...before])).toEqual([]);
	});
	it('returns [] when a line was added or removed', () => {
		expect(findToggledLines(before, ['- [x] a', '- [ ] b', '', '- [ ] c', ''])).toEqual([]);
	});
	it('returns [] when a toggle happens alongside another edit', () => {
		expect(findToggledLines(before, ['- [x] a', '- [ ] bb', '', '- [ ] c'])).toEqual([]);
	});
	it('returns [] for a sort-style reorder (two lines swap)', () => {
		const sortedBefore = ['- [x] a', '- [ ] b'];
		const sortedAfter = ['- [ ] b', '- [x] a'];
		expect(findToggledLines(sortedBefore, sortedAfter)).toEqual([]);
	});
});