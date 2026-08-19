interface HelpEntry {
  title: string;
  body: string;
}

interface HelpSection {
  heading: string;
  entries: HelpEntry[];
}

// Nội dung ở đây là các đoạn hướng dẫn chi tiết đã RỜI KHỎI chân mỗi Properties Panel component
// riêng lẻ trong Landing Builder — gom về đây để panel gọn lại, chỉ còn field cần chỉnh, không lẫn
// đoạn văn dài. Field-level hint NGẮN, gắn liền 1 input cụ thể (vd lỗi tên trùng) vẫn giữ nguyên tại
// chỗ trong panel, không dời qua đây — chỉ đoạn giải thích tổng quát "cái này hoạt động ra sao" mới dời.
const SECTIONS: HelpSection[] = [
  {
    heading: "About this project",
    entries: [
      {
        title: "Maintainer & contact",
        body: "This repository is currently maintained by the Digital Marketing Team at KidsPlaza. For questions, access requests, or contributions, please contact the team via email at quang.nn@kidsplaza.vn (internal) or nhatquang.nguyen.129@gmail.com (external). It powers Lucky Draw Studio, an offline, event-based prize drawing application built with Electron — letting organizers configure prize structures, participant lists, draw rules, and display logic for live events.",
      },
      {
        title: "⚠️ Disclaimer",
        body: "Intended for internal use only. It contains custom business logic designed specifically for KidsPlaza's event and prize-draw workflows, naming conventions, and data structures. Do not reuse, replicate, or adapt this application outside of this context without prior approval. Redistribution, publication, or open-sourcing of any part of this project is strictly prohibited without explicit written consent from the company.",
      },
    ],
  },
  {
    heading: "Interactive",
    entries: [
      {
        title: "Button",
        body: 'Runs exactly one fixed action when clicked in Present Mode — pick the action in its panel (None/Draw/Confirm/Reset/Scoreboard/Open Link). "Draw" doubles as redraw: click it again while a candidate is still waiting on Confirm and it draws again for the same prize instead of starting an unrelated new draw. Each action can only be assigned to one Button per page — a taken action shows greyed out with a tooltip naming which Button already has it. Buttons only respond to clicks in the real Present Mode window — in the Builder they\'re shown disabled so editing never triggers anything. "Open Link" needs a URL field picked too — it opens that field\'s value, read from the most recent winner, in the OS\'s default browser; does nothing if there\'s no winner yet or the field is empty.',
      },
      {
        title: "Button — Confirm and Reset write real data",
        body: '"Confirm" commits the pending draw result to the database — a real, permanent write (INSERT draw_results + UPDATE prizes.remaining), not undone by the toolbar\'s Discard button. It does nothing if there\'s no pending candidate (run "Draw" first) or one is already confirmed. "Reset" deletes ALL draw results for the session — also permanent, also not undone by the toolbar\'s Discard button. Every other action on this page (including redrawing with "Draw") only edits landing_config, which the toolbar\'s Discard always reverts safely.',
      },
    ],
  },
  {
    heading: "Draw & Results",
    entries: [
      {
        title: "Lucky Wheel",
        body: 'Starts spinning automatically the moment a new candidate appears (results[0] changes) — from a Button\'s "Draw" action (including a redraw), no wiring needed. Stops exactly when the spin animation really finishes, landing on the real winner from the Draw Engine.',
      },
      {
        title: "Scoreboard",
        body: 'Only shows winners that have been Confirmed — a pending (not yet confirmed) draw never appears here. Hidden by default in Present Mode — add a Button with the "Scoreboard" action to reveal it as a popup in the center of the screen, sized to this component\'s width/height (drag to resize). This component is often large in the Builder canvas — use the Layers panel (toolbar) to temporarily hide it while editing other components.',
      },
    ],
  },
];

export default function Help() {
  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-medium text-base-100">Help</h1>
        <p className="mt-1 text-sm text-base-400">
          How specific Landing Builder components behave — the Properties Panel itself only shows the
          fields you can edit.
        </p>
      </header>

      <div className="max-w-2xl space-y-6">
        {SECTIONS.map((section) => (
          <div key={section.heading} className="rounded-xl border border-base-800 bg-base-900 p-6">
            <h2 className="font-display text-base font-medium text-base-100">{section.heading}</h2>
            <div className="mt-4 space-y-4">
              {section.entries.map((entry) => (
                <div key={entry.title}>
                  <p className="text-sm font-medium text-base-200">{entry.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-base-400">{entry.body}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
