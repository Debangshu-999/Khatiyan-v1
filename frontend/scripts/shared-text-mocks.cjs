// The two text helpers every card now uses (user, 2026-10-28), for the test harnesses that load a
// screen with its imports stubbed. FitText draws as Text, so a tree reads as it did before, and
// cardName is the real rule: first and last name.
module.exports = {
  "@/components/fit-text": { FitText: "Text" },
  "@/lib/person-name": {
    cardName: (name) => {
      const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
      return words.length > 2 ? `${words[0]} ${words[words.length - 1]}` : words.join(" ");
    },
  },
};
