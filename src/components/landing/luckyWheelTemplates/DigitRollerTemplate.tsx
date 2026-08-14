import { useEffect, useRef, useState } from "react";
import { getParticipantField, LandingData, LuckyWheelComponent } from "@/lib/landing/types";
import "./digitRollerEffects.css";

// Tốc độ nhấp nháy ký tự lúc "đang quay" (rollStyle "flicker") — chạy từ nhanh (MIN_DELAY) tới chậm
// (MAX_DELAY) theo đúng đường cong spinEasing đã chọn khi đang ở PHA CHỐT (settling) của riêng ô đó;
// lúc còn "chờ tới lượt" luôn giữ đúng MIN_DELAY (nhanh, không giảm tốc).
const MIN_DELAY = 40;
const MAX_DELAY = 220;

function ease(p: number, easing: LuckyWheelComponent["props"]["spinEasing"]): number {
  if (easing === "linear") return p;
  if (easing === "easeOut") return 1 - Math.pow(1 - p, 3);
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

// --- rollStyle "reel" — máy quay số cơ khí thật, mô phỏng QUÁN TÍNH thật (không phải text scramble,
// không phải CSS-easing đơn thuần) ---
//
// Mỗi ô là 1 bánh xe độc lập, LUÔN cuộn tuần tự đúng bảng chữ cái của nó (0-9 lặp lại nếu ký tự
// thật là số, A-Z/a-z lặp lại nếu là chữ). Vị trí cuộn (translateY) được tính lại MỖI KHUNG HÌNH
// bằng 1 hàm quãng đường theo thời gian có 3 pha vật lý — KHÔNG dùng CSS transition/easing đơn giản
// (không đủ khả năng đảm bảo "vài ký tự cuối luôn đủ chậm để đọc được"):
//   - Pha tăng tốc (~8% thời lượng): vận tốc tăng dần từ 0 lên tốc độ hành trình.
//   - Pha hành trình (~60-70%): vận tốc GIỮ NGUYÊN không đổi — đây là phần chiếm phần lớn thời gian.
//   - Pha giảm tốc (~25-30%): vận tốc giảm dần ĐỀU (gia tốc âm không đổi) về đúng 0 tại ký tự thật —
//     hệ quả vật lý tự nhiên của giảm tốc đều là khoảng cách thời gian giữa các ký tự đi qua CÀNG LÚC
//     CÀNG DÃN RA, nên vài ký tự cuối luôn đủ chậm để mắt đọc được, không "nhảy" thẳng tới kết quả.
// Mỗi ô random nhẹ (8-15 vòng quay đầy đủ, ±10% thời lượng mỗi pha) để không ô nào giống hệt ô nào —
// tránh cảm giác máy tính. Không dùng filter blur (tốc độ hành trình đã đủ nhanh để mắt không theo
// kịp từng ký tự mà không cần blur giả tạo).
const WHEEL_DIGITS = "0123456789";
const WHEEL_UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const WHEEL_LOWER = "abcdefghijklmnopqrstuvwxyz";

function wheelFor(ch: string): string {
  if (/[0-9]/.test(ch)) return WHEEL_DIGITS;
  if (/[A-Z]/.test(ch)) return WHEEL_UPPER;
  if (/[a-z]/.test(ch)) return WHEEL_LOWER;
  return ch || " "; // ký tự đặc biệt/khoảng trắng — không có bảng chữ cái hợp lý, đứng yên luôn
}

interface ReelPlan {
  strip: string[]; // strip[0] = ký tự thật (vị trí nghỉ), strip[kMax] = ký tự xa nhất lúc bắt đầu
  kMax: number; // tổng số hàng phải lướt qua — 0 nghĩa là ô này không có bánh xe (đứng yên luôn)
  ta: number; // ms — thời lượng pha tăng tốc
  tc: number; // ms — thời lượng pha hành trình
  td: number; // ms — thời lượng pha giảm tốc
  vc: number; // hàng/ms — vận tốc hành trình (không đổi trong pha tc)
  duration: number; // ta+tc+td — tổng thời lượng animation của riêng ô này
}

/** Random nhẹ 8 vòng quay đầy đủ trở lên (điểm yêu cầu: 8-15 vòng) + jitter ±10% cho từng pha, để
 * mỗi ô "cảm nhận" hơi khác nhau, không ô nào giống hệt ô nào (tránh cảm giác máy tính). */
function planReelSlot(target: string, duration: number): ReelPlan {
  const alphabet = wheelFor(target);
  const L = alphabet.length;
  if (L <= 1) return { strip: [target], kMax: 0, ta: 0, tc: 0, td: 0, vc: 0, duration: 0 };

  const targetIdx = alphabet.indexOf(target);
  const fullSpins = 8 + Math.floor(Math.random() * 8); // 8..15 vòng đầy đủ
  const kMax = fullSpins * L + targetIdx;
  const forward = Array.from({ length: kMax + 1 }, (_, k) => alphabet[k % L]);
  const strip = forward.slice().reverse(); // strip[0] = alphabet[kMax % L] = target ✓

  const jitter = () => 0.9 + Math.random() * 0.2; // 0.9 - 1.1
  const accelFrac = 0.08 * jitter();
  const decelFrac = 0.28 * jitter();
  const cruiseFrac = Math.max(0.4, 1 - accelFrac - decelFrac);
  const ta = duration * accelFrac;
  const td = duration * decelFrac;
  const tc = duration * cruiseFrac;
  // Tổng quãng đường (kMax hàng) = diện tích dưới đồ thị vận tốc: tam giác (ta) + chữ nhật (tc) +
  // tam giác (td) — giải ngược ra vc (vận tốc hành trình không đổi) để quãng đường khớp đúng kMax.
  const vc = kMax / (ta / 2 + tc + td / 2);

  return { strip, kMax, ta, tc, td, vc, duration: ta + tc + td };
}

/** Số hàng đã lướt qua tính tới thời điểm `elapsed` (ms) kể từ lúc ô này bắt đầu quay — hàm liên
 * tục theo 3 pha ở trên, cho giá trị thập phân (không làm tròn) để chuyển động mượt tuyệt đối. */
function reelRowsTraveled(plan: ReelPlan, elapsed: number): number {
  const { ta, tc, td, vc, duration } = plan;
  const t = Math.max(0, Math.min(elapsed, duration));
  if (t <= ta) {
    return ta > 0 ? (vc * t * t) / (2 * ta) : 0;
  }
  if (t <= ta + tc) {
    return (vc * ta) / 2 + vc * (t - ta);
  }
  const dt = t - ta - tc;
  const tdSafe = Math.max(td, 1);
  return (vc * ta) / 2 + vc * tc + vc * dt - (vc * dt * dt) / (2 * tdSafe);
}

function landingEffectClass(effect: LuckyWheelComponent["props"]["landingEffect"]): string {
  if (effect === "bounce") return "digit-roller-bounce";
  if (effect === "pop") return "digit-roller-pop";
  return "";
}

const FLICKER_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function randomChar(): string {
  return FLICKER_CHARS[Math.floor(Math.random() * FLICKER_CHARS.length)];
}

// Template "digitRoller" — hiện winnerDisplayField của người trúng dưới dạng ô ký tự kiểu máy đánh
// số/slot-machine thật.
//
// rollStyle "flicker": mô hình 2 PHA cho từng ô — "waiting" (chưa tới lượt, nhấp nháy nhanh cố định,
// không giảm tốc) và "settling" (đang chốt, giảm tốc dần theo spinEasing rồi dừng ở ký tự thật).
//
// rollStyle "reel": máy quay số cơ khí thật — xem khối comment lớn phía trên (planReelSlot/
// reelRowsTraveled). landingEffect (none/bounce/pop) chỉ áp dụng cho "flicker"; "reel" hình dung
// gồm 2 PHẦN TÁCH BIỆT — khung trắng (reelCardEffect) và CHÍNH ký tự bên trong (reelNumberEffect) —
// mỗi phần hiệu ứng riêng, không gộp chung, xem LuckyWheelProps.
export default function DigitRollerTemplate({ component, data }: { component: LuckyWheelComponent; data?: LandingData }) {
  const { winnerDisplayField, digitCount, fontFamily, spinDurationMs, spinEasing } = component.props;
  // Config cũ (lưu trước khi có các trục cấu hình animation này) không có các field dưới — fallback
  // tái tạo ĐÚNG hành vi gốc ban đầu (flicker + together + none), không đổi hành vi của landing đã
  // lưu từ trước.
  const rollStyle = component.props.rollStyle ?? "flicker";
  const reelCardEffect = component.props.reelCardEffect ?? "pop";
  const reelNumberEffect = component.props.reelNumberEffect ?? "bounce";
  const revealTiming = component.props.revealTiming ?? "together";
  const revealStaggerMs = component.props.revealStaggerMs ?? 150;
  const landingEffect = component.props.landingEffect ?? "none";
  const landingClass = landingEffectClass(landingEffect);
  const count = Math.max(1, Math.floor(digitCount || 3));
  const participants = data?.participants ?? [];
  const results = data?.results ?? [];

  // Placeholder ban đầu (chưa có lượt quay nào) là ký tự NGẪU NHIÊN, không phải "-" — trông giống
  // 1 ô số thật đang chờ hơn là 1 ô rỗng/lỗi.
  const [chars, setChars] = useState<string[]>(() => Array.from({ length: count }, randomChar));
  // Số ô (từ trái) đã chốt xong giá trị thật — cả 2 revealTiming đều chốt đúng thứ tự trái->phải.
  const [settledCount, setSettledCount] = useState(count);
  const [spinning, setSpinning] = useState(false);
  // Chỉ dùng cho rollStyle "reel" — dải ký tự của từng ô (đặt qua React state vì ảnh hưởng tới what
  // gets rendered), và 1 "version" tăng dần mỗi lần ô đó chốt xong để remount áp hiệu ứng nảy 1 lần.
  const [reelStrips, setReelStrips] = useState<string[][]>(() => Array(count).fill([]));
  const [reelBounceVersion, setReelBounceVersion] = useState<number[]>(() => Array(count).fill(0));
  // transform cuộn của "reel" được set TRỰC TIẾP vào DOM qua ref mỗi khung hình (không qua React
  // state) — animation ở 60fps, đi qua setState mỗi frame sẽ tốn re-render không cần thiết.
  const slotElsRef = useRef<(HTMLDivElement | null)[]>([]);
  const cellHeightRef = useRef(0);
  // Giữ trạng thái huỷ/rafId của LƯỢT QUAY ĐANG CHẠY (nếu có) trong 1 ref — để startSpin() có thể
  // gọi lại nhiều lần (mỗi lần candidate mới xuất hiện) và tự huỷ đúng vòng lặp rAF của lượt TRƯỚC
  // trước khi bắt đầu lượt mới, tránh 2 lượt chồng lên nhau.
  const spinAbortRef = useRef<{ cancelled: boolean; rafId: number } | null>(null);

  useEffect(() => {
    setChars((prev) => (prev.length === count ? prev : Array.from({ length: count }, randomChar)));
    setSettledCount(count);
    setReelStrips(Array(count).fill([]));
    setReelBounceVersion(Array(count).fill(0));
  }, [count]);

  // Bắt đầu quay tới ĐÚNG người trúng đang có ở results[0] — gọi khi phát hiện results[0].id vừa
  // đổi (xem useEffect bên dưới), tự dò thẳng từ data, không qua tín hiệu/component nào khác.
  function startSpin() {
    const latest = results[0];
    if (!latest) return;

    const winner = participants.find((p) => p.id === latest.participant_id);
    if (!winner) return;

    if (spinAbortRef.current) {
      spinAbortRef.current.cancelled = true;
      cancelAnimationFrame(spinAbortRef.current.rafId);
    }
    const abort = { cancelled: false, rafId: 0 };
    spinAbortRef.current = abort;

    // Hiển thị NGUYÊN VẸN giá trị thật — không lọc ký tự, không cắt prefix. slice/padStart chỉ là
    // lưới an toàn cho trường hợp hiếm dữ liệu lệch độ dài so với lúc validate ở panel.
    const rawValue = getParticipantField(winner, winnerDisplayField);
    const targetChars = rawValue.slice(-count).padStart(count, " ").split("");

    // Thời điểm CHỐT của từng ô — "together": tất cả chốt cùng lúc, lúc spinDurationMs. "sequential":
    // ô sau chốt trễ hơn ô trước 1 khoảng NGẪU NHIÊN quanh revealStaggerMs (70%-130%, không phải 1
    // con số cố định lặp lại y hệt) — giống nhịp dừng hơi khác nhau của máy quay số thật.
    const stopAt: number[] = [];
    for (let i = 0; i < count; i++) {
      if (i === 0 || revealTiming !== "sequential") {
        stopAt.push(spinDurationMs);
      } else {
        const gap = revealStaggerMs * (0.7 + Math.random() * 0.6);
        stopAt.push(stopAt[i - 1] + gap);
      }
    }

    setSpinning(true);
    setSettledCount(0);

    if (rollStyle === "reel") {
      const plans = targetChars.map((t, i) => planReelSlot(t, stopAt[i]));
      setReelStrips(plans.map((p) => p.strip));

      const startTime = performance.now();
      const settledFlags = Array(count).fill(false);
      let settled = 0;
      let reportedSettled = -1; // chỉ setState khi số ô đã chốt THỰC SỰ đổi — animation cuộn tự nó
      // chạy qua ref/DOM trực tiếp mỗi khung hình, không cần setState (và re-render) 60 lần/giây.

      const frame = () => {
        const elapsed = performance.now() - startTime;
        for (let i = 0; i < count; i++) {
          if (settledFlags[i]) continue;
          const plan = plans[i];
          const el = slotElsRef.current[i];
          if (plan.kMax === 0) {
            if (el) el.style.transform = "translateY(0px)";
            settledFlags[i] = true;
            settled += 1;
            continue;
          }
          const rows = reelRowsTraveled(plan, elapsed);
          const index = plan.kMax - rows; // giá trị thập phân — cuộn mượt tuyệt đối, không giật khung
          if (el) el.style.transform = `translateY(${-index * cellHeightRef.current}px)`;
          if (elapsed >= plan.duration) {
            settledFlags[i] = true;
            settled += 1;
            setReelBounceVersion((prev) => {
              const next = [...prev];
              next[i] += 1;
              return next;
            });
          }
        }
        if (settled !== reportedSettled) {
          reportedSettled = settled;
          setSettledCount(settled);
        }
        if (settled < count && !abort.cancelled) {
          abort.rafId = requestAnimationFrame(frame);
        } else {
          setSpinning(false);
        }
      };
      abort.rafId = requestAnimationFrame(frame);
    } else {
      const startTime = performance.now();
      const localChars = [...chars];
      const nextFlickerAt = Array(count).fill(0);
      let settled = 0;

      const frame = () => {
        const elapsed = performance.now() - startTime;
        let charsChanged = false;

        for (let i = settled; i < count; i++) {
          if (elapsed >= stopAt[i]) {
            if (i === settled) {
              settled += 1;
              localChars[i] = targetChars[i];
              charsChanged = true;
            }
            continue;
          }

          const settleStart = i === 0 || revealTiming !== "sequential" ? 0 : stopAt[i - 1];
          const isSettling = elapsed >= settleStart;

          if (elapsed >= nextFlickerAt[i]) {
            localChars[i] = randomChar();
            charsChanged = true;
            if (isSettling) {
              const localProgress = Math.min(1, (elapsed - settleStart) / Math.max(1, stopAt[i] - settleStart));
              nextFlickerAt[i] = elapsed + MIN_DELAY + (MAX_DELAY - MIN_DELAY) * ease(localProgress, spinEasing);
            } else {
              nextFlickerAt[i] = elapsed + MIN_DELAY; // "waiting" — nhanh, cố định, không giảm tốc
            }
          }
        }

        if (charsChanged) setChars([...localChars]);
        setSettledCount(settled);

        if (settled < count && !abort.cancelled) {
          abort.rafId = requestAnimationFrame(frame);
        } else {
          setSpinning(false);
        }
      };
      abort.rafId = requestAnimationFrame(frame);
    }
  }

  useEffect(() => () => {
    if (spinAbortRef.current) {
      spinAbortRef.current.cancelled = true;
      cancelAnimationFrame(spinAbortRef.current.rafId);
    }
  }, []);

  // Tự phát hiện có candidate MỚI (results[0].id đổi) rồi tự bắt đầu quay — cơ chế gốc trước khi có
  // Trigger Graph (đã bỏ), xem comment tương tự ở WheelTemplate.tsx.
  const lastSpunIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const latestId = results[0]?.id;
    if (latestId === undefined || latestId === lastSpunIdRef.current) return;
    lastSpunIdRef.current = latestId;
    startSpin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results[0]?.id]);

  // Kích thước ô số luôn tính từ khung kéo thả (component.width/height) trên canvas — giống cách
  // WheelTemplate lấy size = min(width, height) — để kéo-resize khung là cách trực tiếp, trực quan
  // để phóng to/thu nhỏ số (đúng như Wheel Circular), không lệ thuộc 1 field "Font size" tách rời.
  const gap = 8; // khớp class Tailwind gap-2 bên dưới
  const widthBound = Math.max(20, component.width);
  const heightBound = Math.max(20, component.height);
  let cellHeight = heightBound;
  let cellWidth = cellHeight * 0.7;
  const totalWidth = count * cellWidth + gap * (count - 1);
  if (totalWidth > widthBound) {
    const scale = widthBound / totalWidth;
    cellHeight *= scale;
    cellWidth *= scale;
  }
  cellHeight = Math.max(20, cellHeight);
  cellWidth = Math.max(14, cellWidth);
  const fontSize = cellHeight * 0.5;
  cellHeightRef.current = cellHeight; // luôn đọc giá trị MỚI NHẤT trong vòng lặp rAF, kể cả khi resize giữa lúc đang quay

  return (
    <div className="flex h-full w-full items-center justify-center gap-2" style={{ fontFamily }}>
      {Array.from({ length: count }, (_, i) => {
        const isSettled = i < settledCount;
        const strip = rollStyle === "reel" ? reelStrips[i] : undefined;

        if (strip && strip.length > 0) {
          // Ô "reel" ĐÃ CHỐT — chuyển sang hiển thị TĨNH (không cần dải cuộn nữa), tách riêng 2 lớp
          // hiệu ứng độc lập đúng yêu cầu: khung trắng NGOÀI (reelCardEffect, "bật ra" chớp nhoáng)
          // và CHÍNH ký tự bên trong (reelNumberEffect, nảy nhẹ kiểu bóng chạm đất) — 2 class riêng
          // trên 2 element khác nhau nên không đụng/chồng transform lên nhau. `key` đổi mỗi lần chốt
          // (reelBounceVersion) để React remount, tự phát lại cả 2 animation đúng 1 lần.
          if (isSettled) {
            return (
              <div
                key={`${i}-${reelBounceVersion[i]}`}
                className={`relative overflow-hidden rounded-lg bg-white shadow-lg ${
                  reelCardEffect === "pop" ? "digit-roller-bounce" : ""
                }`}
                style={{ width: cellWidth, height: cellHeight }}
              >
                <div
                  className={`flex h-full w-full items-center justify-center text-[#111827] ${
                    reelNumberEffect === "bounce" ? "digit-roller-number-bounce" : ""
                  }`}
                  style={{ fontSize, fontWeight: 800 }}
                >
                  {strip[0]}
                </div>
              </div>
            );
          }
          // Chưa chốt — vẫn đang cuộn: dải ký tự, transform (translateY) được cập nhật trực tiếp
          // qua ref mỗi khung hình (xem effect chính) — KHÔNG đặt transform qua style ở đây (tránh
          // 2 nơi cùng ghi đè nhau), và KHÔNG áp reelCardEffect/reelNumberEffect (chỉ áp lúc vừa chốt).
          return (
            <div
              key={i}
              className="relative overflow-hidden rounded-lg bg-white shadow-lg"
              style={{ width: cellWidth, height: cellHeight }}
            >
              <div ref={(el) => (slotElsRef.current[i] = el)}>
                {strip.map((sc, j) => (
                  <div
                    key={j}
                    className="flex items-center justify-center text-[#111827]"
                    style={{ height: cellHeight, fontSize, fontWeight: 800 }}
                  >
                    {sc}
                  </div>
                ))}
              </div>
            </div>
          );
        }

        // "flicker", hoặc "reel" trước khi có lượt quay đầu tiên (placeholder tĩnh) — ô chưa chốt
        // nhấp nháy nhẹ (scale) để báo hiệu đang quay; ô vừa chốt phát landingEffect đúng 1 lần qua
        // đổi `key` (React remount) để CSS animation tự phát lại. landingEffect chỉ áp dụng cho
        // "flicker" — "reel" dùng reelCardEffect/reelNumberEffect riêng (xem nhánh trên).
        const applyLandingClass = isSettled && rollStyle === "flicker";
        return (
          <div
            key={`${i}-${isSettled ? "settled" : "pending"}`}
            className={`flex items-center justify-center rounded-lg bg-white text-[#111827] shadow-lg transition-transform ${
              spinning && !isSettled ? "scale-[1.03]" : ""
            } ${applyLandingClass ? landingClass : ""}`}
            style={{ width: cellWidth, height: cellHeight, fontSize, fontWeight: 800 }}
          >
            {chars[i] ?? "-"}
          </div>
        );
      })}
    </div>
  );
}
