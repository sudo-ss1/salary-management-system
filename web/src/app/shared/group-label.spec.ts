import { groupLabel } from './group-label';

describe('groupLabel', () => {
  it('title-cases non-country dimensions but leaves a country code as-is', () => {
    expect(groupLabel({ country: 'BR', level: 'JUNIOR' })).toBe('BR · Junior');
  });

  it('labels the whole-organization group when there is no key', () => {
    expect(groupLabel({})).toBe('Whole organization');
  });

  it('joins more than one dimension in insertion order', () => {
    expect(groupLabel({ department: 'ENGINEERING', role: 'SOFTWARE_ENGINEER' }))
      .toBe('Engineering · Software Engineer');
  });
});
