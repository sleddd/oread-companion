// Narrative System Loader — UI only
// Provides narrator-voice options for the Settings dropdown. The actual
// narrative style definitions (frame/format/constraint) and all prompt
// building live in oread-cli (src/core/narrativeSystemLoader.js +
// promptBuilder.js). This GUI never builds prompts.

// Human-facing labels for the narrator-voice dropdown. Keys must match the
// style keys oread-cli understands (see oread-cli narrative-system/styles.json).
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
 * Get all available narrator-voice options for the dropdown.
 * @returns {Array} - Array of { value, label } for the Dropdown component
 */
export function getNarrativeOptions() {
  const options = [{ value: '', label: 'None' }];

  for (const [key, label] of Object.entries(styleLabels)) {
    options.push({ value: key, label });
  }

  return options;
}
