/**
 * Initial 1o8 org chart, transcribed from the "2026 Org Chart" tab of the
 * "All 1o8 Clients (Final)" sheet. That tab is a hand-drawn layout (merged
 * cells, not a table), so it is captured here once; after seeding, the
 * hub's org_positions table is the source of truth and admins edit it in
 * Team → Org chart. `null` = an open seat.
 */
export type SeedSeat = {
  title: string;
  person: string | null;
  area?: string;
  children?: SeedSeat[];
};

const seats = (title: string, people: (string | null)[], children?: SeedSeat[]): SeedSeat[] =>
  people.map((person, i) => ({ title, person, ...(i === 0 && children ? { children } : {}) }));

export const ORG_CHART_SEED: SeedSeat = {
  title: "Owner",
  person: "Aalap Shah",
  area: "leadership",
  children: [
    { title: "Sales", person: "Aalap Shah", area: "leadership" },
    { title: "Executive / Operations Assistant", person: null, area: "leadership" },
    {
      title: "CEO",
      person: "Jake Kosten",
      area: "leadership",
      children: [
        {
          title: "Head of Client Services / Operations",
          person: null,
          area: "operations",
          children: [
            {
              title: "Accounts Leader",
              person: "Barbara McDonald",
              area: "accounts",
              children: [
                ...seats("Account Managers", [null, "Paulina Gonzalez", "Alejandro Bertoldi", null]),
                ...seats("Project Manager", [null, null]),
              ],
            },
            { title: "Strategy", person: null, area: "strategy" },
            {
              title: "Creative Director",
              person: "Jason Geis",
              area: "creative",
              children: [
                {
                  title: "Creative Lead",
                  person: "Ryan Markie",
                  children: [
                    { title: "Director Creative", person: "Aubrey Hohisel" },
                    { title: "Studio Lead", person: "Lauren Svatos" },
                    ...seats("Designers", ["Romina Bello", "Arlo Martin", null, null]),
                    { title: "Copywriter", person: "Jason Mann" },
                    { title: "Social Media", person: "Komal Patel" },
                  ],
                },
              ],
            },
            {
              title: "Email Lead",
              person: "Tiffani Bassett",
              area: "email",
              children: [{ title: "Jr. Email", person: "Ryshel Hipolito" }],
            },
            {
              title: "Web Dev Lead",
              person: "Derrick Haisman",
              area: "web",
              children: [
                ...seats("Web Support", ["Chohdi Othman", "Med Othman", null]),
                { title: "SEO", person: null },
                { title: "Data Analyst", person: null },
              ],
            },
            {
              title: "Paid Media Lead",
              person: null,
              area: "paid_media",
              children: [
                ...seats("Paid Media Specialist", ["Alexander Krutko", "Evan Dorosheff", "Fabricio Cardenas", "Andrés Máximo Máximo"]),
                { title: "JR Paid Media", person: null },
              ],
            },
          ],
        },
      ],
    },
    { title: "Finance", person: "Shivani Shah", area: "leadership" },
    { title: "Finance Support", person: "Bruna Freire", area: "leadership" },
    { title: "HR Manager", person: "Michael Heavener", area: "leadership" },
  ],
};
