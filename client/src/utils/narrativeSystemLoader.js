// Narrative System Loader
// Loads narrative style definitions from JSON and builds prompt guidance

import narrativeData from '../data/narrative-system/styles.json';

const { styles } = narrativeData;

// Labels for the dropdown UI
const styleLabels = {
  companion: 'Companion/Chat',
  omniscient: 'Omniscient Narrator',
  third_person_limited: 'Third-person Limited',
  first_person: 'First-person Narrator',
  second_person: 'Second-person Narrator',
  cinematic: 'Cinematic Style',
  literary: 'Literary Prose'
};

/**
 * Get all available narrative style options for the dropdown
 * @returns {Array} - Array of { value, label } for Dropdown component
 */
export function getNarrativeOptions() {
  const options = [{ value: '', label: 'None' }];

  for (const key of Object.keys(styles)) {
    options.push({ value: key, label: styleLabels[key] || key });
  }

  return options;
}

/**
 * Get a narrative style definition by key
 * @param {String} styleKey - The narrative style key
 * @returns {Object|null} - { frame, format, constraint, label } or null
 */
export function getNarrativeStyle(styleKey) {
  if (!styleKey) return null;
  const style = styles[styleKey];
  if (!style) return null;
  return { ...style, label: styleLabels[styleKey] || styleKey };
}
