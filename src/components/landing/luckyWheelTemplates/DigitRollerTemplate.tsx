import { useEffect, useMemo, useRef, useState } from "react";
import {
  computeActiveParticipantCoreFields,
  isLiveDrawResultId,
  LandingData,
  LuckyWheelComponent,
  resolveWheelField,
} from "@/lib/landing/types";
import "./digitRollerEffects.css";

// Tốc độ hành trình của rollStyle "flicker" — 1 lần đổi ký tự mỗi FLICKER_STEP_MS ở pha hành trình
// (vận tốc tối đa), rồi thưa dần theo ĐÚNG mô hình chuyển động chung với "reel" (xem SpinTiming/
// stepsTraveled bên dưới) — Flicker chỉ khác Reel ở cách HIỂN THỊ 1 "bước" (đổi ký tự ngẫu nhiên thay
// vì cuộn 1 hàng), còn tốc độ theo thời gian (tăng tốc/hành trình/giảm tốc) giống hệt.
const FLICKER_STEP_MS = 40;

// --- Mô hình chuyển động CHUNG cho cả 2 rollStyle — mô phỏng QUÁN TÍNH thật (không phải 1 CSS
// transition/easing string đơn thuần như WheelTemplate.tsx) ---
//
// Mỗi ô chạy độc lập theo 1 hàm quãng đường ("số bước đã đi") theo thời gian có 3 pha vật lý, kết
// thúc ĐÚNG lúc ô đó chốt (stopAt của riêng ô — nên với revealTiming "sequential", ô sau chỉ đơn giản
// có tổng thời lượng dài hơn, VẪN có đủ pha giảm tốc riêng, không bị dồn vào 1 khoảng stagger ~150ms
// như mô hình "waiting/settling" cũ của flicker — bug đã gặp thật: chỉ ô đầu tiên thật sự giảm tốc):
//   - Pha tăng tốc (~8% thời lượng): vận tốc tăng dần ĐỀU từ 0 lên tốc độ hành trình.
//   - Pha hành trình (~60-70%): vận tốc GIỮ NGUYÊN không đổi — đây là phần chiếm phần lớn thời gian.
//   - Pha giảm tốc (~25-30%): vận tốc giảm ĐỀU (gia tốc âm không đổi) về đúng 0 lúc chốt — khoảng
//     thời gian giữa các bước dãn ra đều, vài bước cuối đủ chậm để đọc được.
// Từng có dropdown "Spin style" (Fast Start and Slow Stop/Smooth/Slow Start and Fast Stop) đổi hình
// dạng pha giảm tốc — đã bỏ hẳn vì khác biệt không đáng kể khi xem thật, chỉ giữ giảm tốc đều.
// "reel": 1 bước = cuộn 1 hàng trên dải ký tự (giá trị thập phân — cuộn mượt). "flicker": 1 bước = đổi
// sang 1 ký tự ngẫu nhiên (đổi mỗi khi phần nguyên của số bước tăng).
// Mỗi ô random nhẹ ±10% thời lượng mỗi pha để không ô nào giống hệt ô nào — tránh cảm giác máy tính.

interface SpinTiming {
  ta: number; // ms — thời lượng pha tăng tốc
  tc: number; // ms — thời lượng pha hành trình
  td: number; // ms — thời lượng pha giảm tốc
  duration: number; // ta+tc+td — tổng thời lượng animation của riêng ô này
  // Quãng đường đi được nếu vận tốc hành trình = 1 bước/ms (diện tích dưới đồ thị vận tốc chuẩn hoá):
  // tam giác (ta) + chữ nhật (tc) + tam giác (td). Chia tổng số bước cho giá trị này ra `vc` khớp đúng đích.
  unitDistance: number;
}

function planSpinTiming(duration: number): SpinTiming {
  const jitter = () => 0.9 + Math.random() * 0.2; // 0.9 - 1.1
  const accelFrac = 0.08 * jitter();
  const decelFrac = 0.28 * jitter();
  const cruiseFrac = Math.max(0.4, 1 - accelFrac - decelFrac);
  const ta = duration * accelFrac;
  const td = duration * decelFrac;
  const tc = duration * cruiseFrac;
  return { ta, tc, td, duration: ta + tc + td, unitDistance: ta / 2 + tc + td / 2 };
}

// --- rollStyle "reel" — máy quay số cơ khí thật: mỗi ô là 1 bánh xe, LUÔN cuộn tuần tự đúng bảng chữ
// cái của nó (0-9 lặp lại nếu ký tự thật là số, A-Z/a-z lặp lại nếu là chữ), 8-15 vòng đầy đủ. Không
// dùng filter blur (tốc độ hành trình đã đủ nhanh để mắt không theo kịp từng ký tự). ---
const WHEEL_DIGITS = "0123456789";
const WHEEL_UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const WHEEL_LOWER = "abcdefghijklmnopqrstuvwxyz";

function wheelFor(ch: string): string {
  if (/[0-9]/.test(ch)) return WHEEL_DIGITS;
  if (/[A-Z]/.test(ch)) return WHEEL_UPPER;
  if (/[a-z]/.test(ch)) return WHEEL_LOWER;
  return ch || " "; // ký tự đặc biệt/khoảng trắng — không có bảng chữ cái hợp lý, đứng yên luôn
}

// Kế hoạch chuyển động của 1 ô — dùng chung cho cả 2 rollStyle (reel thêm strip/kMax riêng).
interface SpinMotion {
  ta: number;
  tc: number;
  td: number;
  vc: number; // bước/ms — vận tốc hành trình (không đổi trong pha tc)
  duration: number;
}

interface ReelPlan extends SpinMotion {
  strip: string[]; // strip[0] = ký tự thật (vị trí nghỉ), strip[kMax] = ký tự xa nhất lúc bắt đầu
  kMax: number; // tổng số hàng phải lướt qua — 0 nghĩa là ô này không có bánh xe (đứng yên luôn)
}

/** Random nhẹ 8 vòng quay đầy đủ trở lên (điểm yêu cầu: 8-15 vòng) + jitter ±10% cho từng pha, để
 * mỗi ô "cảm nhận" hơi khác nhau, không ô nào giống hệt ô nào (tránh cảm giác máy tính).
 * `alphabetOverride` — CHỈ dùng cho lượt quay chốt "-" sau Quick Draw (xem runRoll trong
 * DigitRollerTemplate): wheelFor("-") tự nó trả bảng chữ cái 1 ký tự (kMax = 0, KHÔNG cuộn gì cả —
 * bug đã gặp thật: ô "đứng hình" ngay ở "-" thay vì quay đủ spinDurationMs), nên phải ép 1 bảng
 * chữ cái nhiều ký tự (digit + "-") để CÓ quãng đường mà cuộn. Không đổi hành vi wheelFor cho lượt
 * quay THẬT (startSpin() không truyền override) — 1 dấu "-" xuất hiện tự nhiên trong dữ liệu thật
 * (vd số điện thoại có định dạng gạch nối) vẫn đứng yên như cũ, không bị ép quay giả tạo. */
function planReelSlot(target: string, duration: number, alphabetOverride?: string): ReelPlan {
  const alphabet = alphabetOverride ?? wheelFor(target);
  const L = alphabet.length;
  if (L <= 1) return { strip: [target], kMax: 0, ta: 0, tc: 0, td: 0, vc: 0, duration: 0 };

  const targetIdx = alphabet.indexOf(target);
  const fullSpins = 8 + Math.floor(Math.random() * 8); // 8..15 vòng đầy đủ
  const kMax = fullSpins * L + targetIdx;
  const forward = Array.from({ length: kMax + 1 }, (_, k) => alphabet[k % L]);
  const strip = forward.slice().reverse(); // strip[0] = alphabet[kMax % L] = target ✓

  // Giải ngược ra vc (vận tốc hành trình không đổi) để tổng quãng đường khớp đúng kMax.
  const { ta, tc, td, duration: total, unitDistance } = planSpinTiming(duration);
  return { strip, kMax, ta, tc, td, vc: kMax / unitDistance, duration: total };
}

/** rollStyle "flicker" — cùng timing 3 pha như reel, nhưng vận tốc hành trình cố định 1 bước mỗi
 * FLICKER_STEP_MS (không có đích kMax cần khớp — ô chốt về ký tự thật đúng lúc hết `duration`). */
function planFlickerSlot(duration: number): SpinMotion {
  const { ta, tc, td, duration: total } = planSpinTiming(duration);
  return { ta, tc, td, vc: 1 / FLICKER_STEP_MS, duration: total };
}

/** Số bước đã đi tính tới thời điểm `elapsed` (ms) kể từ lúc ô này bắt đầu quay — hàm liên tục theo 3
 * pha ở trên, cho giá trị thập phân (không làm tròn) để chuyển động mượt tuyệt đối. */
function stepsTraveled(plan: SpinMotion, elapsed: number): number {
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
  const p = Math.min(1, dt / tdSafe);
  return (vc * ta) / 2 + vc * tc + vc * tdSafe * (p - (p * p) / 2);
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
// Cả 2 rollStyle dùng CHUNG mô hình tốc độ 3 pha (planSpinTiming/stepsTraveled — xem
// khối comment lớn phía trên), chỉ khác cách hiển thị 1 bước:
// rollStyle "flicker": mỗi bước đổi sang 1 ký tự ngẫu nhiên, hết thời lượng thì chốt ký tự thật.
// rollStyle "reel": máy quay số cơ khí thật, mỗi bước cuộn 1 hàng (planReelSlot). landingEffect (none/bounce/pop) chỉ áp dụng cho "flicker"; "reel" hình dung
// gồm 2 PHẦN TÁCH BIỆT — khung trắng (reelCardEffect) và CHÍNH ký tự bên trong (reelNumberEffect) —
// mỗi phần hiệu ứng riêng, không gộp chung, xem LuckyWheelProps.
export default function DigitRollerTemplate({ component, data }: { component: LuckyWheelComponent; data?: LandingData }) {
  const { winnerDisplayField, digitCount, fontFamily, spinDurationMs } = component.props;
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
  const columnTypesJson = data?.columnTypesJson ?? null;
  const quickDrawActive = data?.quickDrawActive ?? false;
  // Cột Name/Phone/Email/Code nào đang thực sự có dữ liệu — dùng để resolve đúng cột đã gán Data
  // Type tương ứng (xem resolveWheelField), không đọc cứng participant.name/.phone/....
  const activeCoreFields = useMemo(() => computeActiveParticipantCoreFields(participants), [participants]);

  // Placeholder ban đầu (chưa có lượt quay nào, hoặc vừa Reset — xem effect "idle" bên dưới) là "-"
  // cho MỌI ô, đúng nghĩa "chưa có gì" thay vì trông giống 1 giá trị thật ngẫu nhiên.
  const [chars, setChars] = useState<string[]>(() => Array(count).fill("-"));
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
    setChars((prev) => (prev.length === count ? prev : Array(count).fill("-")));
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

    // Hiển thị NGUYÊN VẸN giá trị thật — không lọc ký tự, không cắt prefix. slice/padStart chỉ là
    // lưới an toàn cho trường hợp hiếm dữ liệu lệch độ dài so với lúc validate ở panel.
    const targetChars = resolveWheelField(winner, winnerDisplayField, columnTypesJson, activeCoreFields)
      .slice(-count)
      .padStart(count, " ")
      .split("");
    runRoll(targetChars);
  }

  // Chạy đúng 1 lượt quay (RAF loop flicker/reel) tới `targetChars` cho trước — tách riêng khỏi
  // startSpin() để dùng chung cho cả 2 nguồn: (1) quay tới giá trị THẬT của 1 người trúng cụ thể
  // (startSpin() ở trên, không truyền reelAlphabetOverride), (2) quay tới "-" cho mọi ô lúc Quick
  // Draw vừa xong (xem effect "Quick Draw VỪA xong" bên dưới, CÓ truyền reelAlphabetOverride để
  // rollStyle "reel" thật sự cuộn thay vì đứng hình — xem doc-comment planReelSlot).
  function runRoll(targetChars: string[], reelAlphabetOverride?: string) {
    if (spinAbortRef.current) {
      spinAbortRef.current.cancelled = true;
      cancelAnimationFrame(spinAbortRef.current.rafId);
    }
    const abort = { cancelled: false, rafId: 0 };
    spinAbortRef.current = abort;

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
      const plans = targetChars.map((t, i) => planReelSlot(t, stopAt[i], reelAlphabetOverride));
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
          const rows = stepsTraveled(plan, elapsed);
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
      const plans = stopAt.map((d) => planFlickerSlot(d));
      const startTime = performance.now();
      const localChars = [...chars];
      // Phần nguyên số bước đã đi của từng ô — đổi ký tự mỗi khi giá trị này tăng. -1 để đổi ngay
      // khung hình đầu tiên (báo hiệu đã bắt đầu quay).
      const lastStep = Array(count).fill(-1);
      let settled = 0;

      const frame = () => {
        const elapsed = performance.now() - startTime;
        let charsChanged = false;

        for (let i = settled; i < count; i++) {
          if (elapsed >= plans[i].duration) {
            if (i === settled) {
              settled += 1;
              localChars[i] = targetChars[i];
              charsChanged = true;
            }
            continue;
          }

          const step = Math.floor(stepsTraveled(plans[i], elapsed));
          if (step !== lastStep[i]) {
            lastStep[i] = step;
            localChars[i] = randomChar();
            charsChanged = true;
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

  // Đóng băng ở placeholder "-" tĩnh (huỷ lượt quay đang chạy nếu có) trong 2 trường hợp:
  // (1) Idle thật sự — CHƯA từng có kết quả nào trong session (results rỗng): vừa mở landing lần
  //     đầu, HOẶC vừa Reset xong (resetSession() refreshData() trước khi xoá candidate nên results
  //     rỗng THẬT, xem doc-comment resetSession trong useDrawSequence.ts).
  // (2) Đang giữa chừng Quick Draw (quickDrawActive) — results[0].id đổi liên tục không nghỉ theo
  //     từng người trúng, quay riêng lẻ theo từng candidate là vô nghĩa (không có 1 người "đúng" nào,
  //     lượt sau chồng lượt trước trước khi kịp chốt — bug đã gặp thật: ô số kẹt ở trạng thái
  //     nửa-số-thật-nửa-nhấp-nháy do nhiều startSpin() chồng nhau huỷ nhau liên tục). Xem effect
  //     "chạy đúng 1 lượt quay chốt về -" ngay bên dưới — đó mới là lượt quay THẬT hiện cho người xem.
  const isIdle = results.length === 0;
  useEffect(() => {
    if (!isIdle && !quickDrawActive) return;
    if (spinAbortRef.current) {
      spinAbortRef.current.cancelled = true;
      cancelAnimationFrame(spinAbortRef.current.rafId);
      spinAbortRef.current = null;
    }
    setSpinning(false);
    setChars(Array(count).fill("-"));
    setSettledCount(count);
    setReelStrips(Array(count).fill([]));
  }, [isIdle, quickDrawActive, count]);

  // Quick Draw VỪA xong (quickDrawActive true → false) — chạy đúng 1 lượt quay THẬT (đủ nguyên
  // spinDurationMs đã cấu hình, không bị cắt ngang bởi bất kỳ candidate nào khác vì Quick Draw đã
  // dứt hẳn) nhưng chốt ở "-" cho mọi ô, KHÔNG hiện số điện thoại của người trúng cuối cùng — không
  // có 1 người trúng "đúng" nào để hiện riêng giữa 1 loạt trúng cùng lúc.
  const wasQuickDrawActiveRef = useRef(false);
  useEffect(() => {
    const wasActive = wasQuickDrawActiveRef.current;
    wasQuickDrawActiveRef.current = quickDrawActive;
    if (wasActive && !quickDrawActive) runRoll(Array(count).fill("-"), WHEEL_DIGITS + "-");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickDrawActive, count]);

  // Tự phát hiện có candidate MỚI rồi tự bắt đầu quay — cơ chế gốc trước khi có Trigger Graph (đã bỏ),
  // xem comment tương tự ở WheelTemplate.tsx. CHỈ phản ứng với dòng kết quả LIVE (id "pending-*") —
  // bỏ qua kết quả cũ đọc từ DB khi mở lại 1 phiên đã quay dở, tránh tự quay tới winner cũ lúc mount.
  // Bỏ qua hoàn toàn lúc quickDrawActive — xem 2 effect ở trên (đóng băng trong lúc quay, rồi tự
  // chạy đúng 1 lượt "-" khi xong), không quay theo từng candidate riêng lẻ trong Quick Draw.
  const lastSpunIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const latestId = results[0]?.id;
    if (!isLiveDrawResultId(latestId) || latestId === lastSpunIdRef.current) return;
    lastSpunIdRef.current = latestId;
    if (quickDrawActive) return;
    startSpin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results[0]?.id, quickDrawActive]);

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
