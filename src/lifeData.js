// Life Story data: names, traits, careers, looks. Pure data, no logic.

export const FIRST_NAMES = [
  'Ava', 'Kai', 'Noor', 'Mateo', 'Zara', 'Eli', 'Mina', 'Theo', 'Amara', 'Luca', 'Ines', 'Jun', 'Priya', 'Omar',
  'Freya', 'Kofi', 'Lena', 'Ravi', 'Sofia', 'Malik', 'Hana', 'Felix', 'Yara', 'Diego', 'Ivy', 'Sami', 'Clara',
  'Tariq', 'June', 'Nico', 'Aisha', 'Leo', 'Maya', 'Emeka', 'Rosa', 'Arlo', 'Lila', 'Kenji', 'Nadia', 'Ezra',
];
export const LAST_NAMES = [
  'Park', 'Okafor', 'Rivera', 'Haddad', 'Lindqvist', 'Nakamura', 'Moreau', 'Patel', 'Costa', 'Mensah', 'Novak',
  'Ibarra', 'Kowalski', 'Ahmed', 'Bellamy', 'Fontaine', 'Osei', 'Tanaka', 'Romero', 'Quinn', 'Varga', 'Silva',
];

export const PRONOUNS = {
  she: { they: 'she', them: 'her', their: 'her', label: 'She / her' },
  he: { they: 'he', them: 'him', their: 'his', label: 'He / him' },
  they: { they: 'they', them: 'them', their: 'their', label: 'They / them' },
};

export const SKIN_TONES = ['#f6d5bd', '#f1c7a5', '#e8b896', '#c98e6a', '#a86f4c', '#8d5a3f'];
export const HAIR_COLORS = ['#2f2a33', '#5b3a29', '#a0643a', '#e2b86b', '#c9603f', '#b9b4c9'];
export const OUTFIT_COLORS = ['#ff8f7e', '#7fc4ad', '#a98bd0', '#ffcf6e', '#86b5e6', '#f49ab8'];

export const TRAITS = [
  { id: 'curious', label: 'Curious', hint: 'Learns faster' },
  { id: 'outgoing', label: 'Outgoing', hint: 'Makes friends easily' },
  { id: 'thrifty', label: 'Thrifty', hint: 'Saves more money' },
  { id: 'sporty', label: 'Sporty', hint: 'Stays healthier' },
  { id: 'creative', label: 'Creative', hint: 'Shines at art and music' },
  { id: 'calm', label: 'Calm', hint: 'Shrugs off bad days' },
];

// Jobs come from real workplaces in the city. Requirements use Smarts; pay is per year.
export const CAREERS = {
  shop: { titles: ['Shop assistant', 'Senior assistant', 'Shop manager'], pay: [18000, 24000, 34000], smarts: 0 },
  office: { titles: ['Office junior', 'Analyst', 'Team lead', 'Director'], pay: [26000, 38000, 52000, 80000], smarts: 45 },
  school: { titles: ['Teaching assistant', 'Teacher', 'Head teacher'], pay: [22000, 34000, 48000], smarts: 55 },
  clinic: { titles: ['Care assistant', 'Nurse', 'Doctor'], pay: [22000, 36000, 70000], smarts: 60 },
};

export const STAGES = [
  { id: 'baby', label: 'Baby', from: 0 },
  { id: 'child', label: 'Child', from: 3 },
  { id: 'teen', label: 'Teen', from: 13 },
  { id: 'young', label: 'Young adult', from: 18 },
  { id: 'adult', label: 'Adult', from: 30 },
  { id: 'senior', label: 'Senior', from: 60 },
];

export function stageFor(age) {
  let s = STAGES[0];
  for (const st of STAGES) if (age >= st.from) s = st;
  return s;
}
