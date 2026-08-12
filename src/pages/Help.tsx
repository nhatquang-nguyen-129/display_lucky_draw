interface HelpEntry {
  title: string;
  body: string;
}

interface HelpSection {
  heading: string;
  entries: HelpEntry[];
}

// Nội dung ở đây là các đoạn hướng dẫn chi tiết từng RỜI KHỎI chân mỗi Properties Panel component
// riêng lẻ trong Landing Builder (Fireworks/Stage Light/Dim Background/Draw/Confirm Winner/Link
// Opener/Button/Scoreboard) — gom về đây theo yêu cầu người dùng để panel gọn lại, chỉ còn field cần
// chỉnh, không lẫn đoạn văn dài. Field-level hint NGẮN, gắn liền 1 input cụ thể (vd lỗi tên trùng)
// vẫn giữ nguyên tại chỗ trong panel, không dời qua đây — chỉ đoạn giải thích tổng quát "cái này hoạt
// động ra sao" mới dời.
const SECTIONS: HelpSection[] = [
  {
    heading: "Effects",
    entries: [
      {
        title: "Fireworks",
        body: 'Idle by default — wire a link in the Trigger Graph (Button → Play → this component) to make it fire during Present Mode. The Builder shows a static preview only.',
      },
      {
        title: "Stage Light",
        body: "Idle by default — wire a link in the Trigger Graph (Button/Winner Name → Play → this component) to make it sweep during Present Mode. The Builder shows a static beam frozen at the center angle.",
      },
      {
        title: "Dim Background",
        body: 'Idle (fully transparent) by default — wire a link in the Trigger Graph (e.g. Wheel → SpinCompleted → Play → this component) to fade it in during Present Mode, and another link to Stop to fade it back out. Dims whatever is BELOW it in the Layers panel stacking order — drag components you want to stay bright (Wheel, Winner Name, Fireworks...) above this one. The Builder shows it frozen at the target opacity so you can place/size it.',
      },
    ],
  },
  {
    heading: "Actions",
    entries: [
      {
        title: "Draw",
        body: 'Picks a pending winner for the current draw when triggered. Does nothing if there are no eligible participants or prizes left. Wire a link in the Trigger Graph (e.g. Button → "Draw.Pick" → this component) to trigger it — and wire this component\'s own "Draw.Picked" signal onward (e.g. to a Lucky Wheel\'s "Wheel.StartSpin") to react exactly when the pick actually lands, not a guessed delay.',
      },
      {
        title: "Confirm Winner",
        body: 'Commits the pending draw result to the database when triggered — this is a real, permanent write (not undone by Discard). Does nothing if there\'s no pending candidate yet (wire a Draw component first) or one is already confirmed. Wire a link in the Trigger Graph (e.g. Button → "ConfirmWinner.Confirm" → this component) to trigger it.',
      },
      {
        title: "Link Opener",
        body: 'Opens this field\'s value, read from the most recent winner, as a URL in the OS\'s default browser. Does nothing if there\'s no winner yet or the field is empty — wire a link in the Trigger Graph (e.g. Button → "LinkOpener.Open" → this component) to trigger it.',
      },
    ],
  },
  {
    heading: "Interactive",
    entries: [
      {
        title: "Button",
        body: "Wire it in the Trigger Graph to make other components react when it's clicked (see the \"Emits to Trigger Graph\" box in its panel for the exact signal name). Buttons only respond to clicks in the real Present Mode window — in the Builder they're shown disabled so editing never triggers anything.",
      },
      {
        title: "Button — disabling it until something happens",
        body: "Every Button also listens for \"Button.Enable\"/\"Button.Disable\" — wire any signal to one of these to lock/unlock it at runtime. Example: to keep Confirm greyed out until the wheel finishes spinning, wire Lucky Wheel's \"Wheel.SpinCompleted\" to the Confirm Button's \"Button.Enable\", and uncheck \"Enabled at the start of Present Mode\" in its panel so it starts locked. Optionally also wire the Draw button's \"Button.Click\" to Confirm's \"Button.Disable\" so re-drawing locks it again until the next spin completes. The Button never knows WHY it's locked — it just tracks whichever of these 2 signals arrived last.",
      },
    ],
  },
  {
    heading: "Draw & Results",
    entries: [
      {
        title: "Scoreboard",
        body: 'Only shows winners that have been Confirmed — a pending (not yet confirmed) draw never appears here. Hidden by default in Present Mode — add a Button with the "Show Winner" action to reveal it as a popup in the center of the screen, sized to this component\'s width/height (drag to resize). This component is often large in the Builder canvas — use the Layers panel (toolbar) to temporarily hide it while editing other components.',
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
