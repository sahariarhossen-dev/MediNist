import React, { useState, useCallback } from "react";
import { Calculator, X } from "lucide-react";

interface QuickCalculatorProps {
  onClose: () => void;
  onApplyValue?: (value: number) => void;
}

export const QuickCalculator: React.FC<QuickCalculatorProps> = ({
  onClose,
  onApplyValue,
}) => {
  const [display, setDisplay] = useState("0");
  const [expression, setExpression] = useState("");
  const [prevValue, setPrevValue] = useState<number | null>(null);
  const [currentOp, setCurrentOp] = useState<string | null>(null);
  const [clearNext, setClearNext] = useState(false);

  // Subtle haptic touch feedback
  const triggerHaptic = useCallback(() => {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(8);
      } catch {}
    }
  }, []);

  const formatCleanNumber = (num: number): string => {
    const rounded = Number(num.toFixed(6));
    // Limit display length to fit nicely
    if (Math.abs(rounded) > 1e11) {
      return rounded.toExponential(4);
    }
    return String(rounded);
  };

  const handleNumber = (digit: string) => {
    triggerHaptic();
    if (clearNext || display === "0") {
      setDisplay(digit);
      setClearNext(false);
      if (currentOp && prevValue !== null) {
        setExpression(`${formatCleanNumber(prevValue)} ${currentOp}`);
      }
    } else {
      // Limit to 12 digits for clean layout
      if (display.replace(/[-.]/g, "").length >= 12) return;
      setDisplay(display + digit);
    }
  };

  const handleDecimal = () => {
    triggerHaptic();
    if (clearNext) {
      setDisplay("0.");
      setClearNext(false);
      if (currentOp && prevValue !== null) {
        setExpression(`${formatCleanNumber(prevValue)} ${currentOp}`);
      }
    } else if (!display.includes(".")) {
      setDisplay(display + ".");
    }
  };

  const executeMath = (a: number, b: number, op: string): number => {
    switch (op) {
      case "+":
        return a + b;
      case "-":
        return a - b;
      case "×":
      case "*":
        return a * b;
      case "÷":
      case "/":
        return b !== 0 ? a / b : 0;
      default:
        return b;
    }
  };

  const handleOperator = (op: string) => {
    triggerHaptic();
    const current = parseFloat(display);

    if (prevValue !== null && currentOp && !clearNext) {
      // Chain calculation: e.g. 5 + 5 + ...
      const result = executeMath(prevValue, current, currentOp);
      const formatted = formatCleanNumber(result);
      setDisplay(formatted);
      setPrevValue(result);
      setExpression(`${formatted} ${op}`);
    } else {
      setPrevValue(current);
      setExpression(`${formatCleanNumber(current)} ${op}`);
    }

    setCurrentOp(op);
    setClearNext(true);
  };

  const handleEqual = () => {
    triggerHaptic();
    const current = parseFloat(display);

    if (prevValue !== null && currentOp) {
      const result = executeMath(prevValue, current, currentOp);
      const formatted = formatCleanNumber(result);
      setExpression(
        `${formatCleanNumber(prevValue)} ${currentOp} ${formatCleanNumber(current)} =`
      );
      setDisplay(formatted);
      setPrevValue(null);
      setCurrentOp(null);
      setClearNext(true);

      if (onApplyValue) {
        onApplyValue(result);
      }
    }
  };

  const handleClear = () => {
    triggerHaptic();
    setDisplay("0");
    setExpression("");
    setPrevValue(null);
    setCurrentOp(null);
    setClearNext(false);
  };

  const handleToggleSign = () => {
    triggerHaptic();
    if (display === "0") return;
    if (display.startsWith("-")) {
      setDisplay(display.slice(1));
    } else {
      setDisplay("-" + display);
    }
  };

  const handlePercent = () => {
    triggerHaptic();
    const current = parseFloat(display);
    if (!isNaN(current)) {
      let result: number;
      if (prevValue !== null && currentOp) {
        // e.g. 200 + 10% -> 10% of 200 is 20
        result = (prevValue * current) / 100;
      } else {
        result = current / 100;
      }
      setDisplay(formatCleanNumber(result));
    }
  };

  return (
    <div
      id="quick-calculator-modal"
      className="w-full max-w-sm mx-auto bg-[#7B1824] text-white rounded-[20px] p-3.5 sm:p-4 shadow-2xl border border-[#9E2B3B]/40 animate-in fade-in zoom-in-95 duration-150 select-none"
      style={{
        boxShadow: "0 10px 30px -5px rgba(123, 24, 36, 0.45), 0 4px 12px rgba(0, 0, 0, 0.25)",
      }}
    >
      {/* 1. Top Header Bar with Title and Close (X) button */}
      <div className="flex items-center justify-between pb-1 text-[#E5C4C8]">
        <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wide">
          <Calculator size={14} className="text-[#E5C4C8]" />
          <span>Quick Calculator</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Calculator"
          className="w-7 h-7 rounded-full flex items-center justify-center text-[#E5C4C8] hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

      {/* 2. Display Area seamlessly blended into top of maroon container */}
      <div className="pt-2 pb-3 px-1.5 text-right flex flex-col justify-end">
        {/* Calculation Expression (e.g. "100 + 100") */}
        <div className="min-h-[22px] text-xs sm:text-[14px] font-mono text-[#E5C4C8] truncate tracking-wide">
          {expression || "\u00A0"}
        </div>
        {/* Active Result / Value prominently in bold white */}
        <div className="text-3xl sm:text-[34px] font-bold text-white tracking-tight tabular-nums leading-tight truncate">
          {display}
        </div>
      </div>

      {/* 3. Grid Layout & Key Arrangement (5 Rows) */}
      <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
        {/* ================= ROW 1 ================= */}
        {/* [ C ] */}
        <button
          type="button"
          onClick={handleClear}
          className="h-10 sm:h-11 rounded-[14px] sm:rounded-2xl bg-[#E5CBD0] hover:bg-[#F2DEE2] active:scale-[0.94] active:opacity-85 text-[#4A0B14] font-bold text-sm sm:text-base flex items-center justify-center transition-all cursor-pointer shadow-xs"
        >
          C
        </button>
        {/* [ +/- ] */}
        <button
          type="button"
          onClick={handleToggleSign}
          className="h-10 sm:h-11 rounded-[14px] sm:rounded-2xl bg-[#E5CBD0] hover:bg-[#F2DEE2] active:scale-[0.94] active:opacity-85 text-[#4A0B14] font-bold text-sm sm:text-base flex items-center justify-center transition-all cursor-pointer shadow-xs"
        >
          +/-
        </button>
        {/* [ % ] */}
        <button
          type="button"
          onClick={handlePercent}
          className="h-10 sm:h-11 rounded-[14px] sm:rounded-2xl bg-[#E5CBD0] hover:bg-[#F2DEE2] active:scale-[0.94] active:opacity-85 text-[#4A0B14] font-bold text-sm sm:text-base flex items-center justify-center transition-all cursor-pointer shadow-xs"
        >
          %
        </button>
        {/* [ ÷ ] */}
        <button
          type="button"
          onClick={() => handleOperator("÷")}
          className={`h-10 sm:h-11 rounded-[14px] sm:rounded-2xl active:scale-[0.94] active:opacity-85 text-white font-bold text-lg sm:text-xl flex items-center justify-center transition-all cursor-pointer shadow-xs ${
            currentOp === "÷" ? "bg-[#C43B51] ring-2 ring-white/50" : "bg-[#A32A3B] hover:bg-[#B83246]"
          }`}
        >
          ÷
        </button>

        {/* ================= ROW 2 ================= */}
        {/* [ 7 ] */}
        <button
          type="button"
          onClick={() => handleNumber("7")}
          className="h-10 sm:h-11 rounded-[14px] sm:rounded-2xl bg-[#FAF0F2] hover:bg-white active:scale-[0.94] active:opacity-85 text-[#5A0E18] font-bold text-base sm:text-lg flex items-center justify-center transition-all cursor-pointer shadow-xs"
        >
          7
        </button>
        {/* [ 8 ] */}
        <button
          type="button"
          onClick={() => handleNumber("8")}
          className="h-10 sm:h-11 rounded-[14px] sm:rounded-2xl bg-[#FAF0F2] hover:bg-white active:scale-[0.94] active:opacity-85 text-[#5A0E18] font-bold text-base sm:text-lg flex items-center justify-center transition-all cursor-pointer shadow-xs"
        >
          8
        </button>
        {/* [ 9 ] */}
        <button
          type="button"
          onClick={() => handleNumber("9")}
          className="h-10 sm:h-11 rounded-[14px] sm:rounded-2xl bg-[#FAF0F2] hover:bg-white active:scale-[0.94] active:opacity-85 text-[#5A0E18] font-bold text-base sm:text-lg flex items-center justify-center transition-all cursor-pointer shadow-xs"
        >
          9
        </button>
        {/* [ × ] */}
        <button
          type="button"
          onClick={() => handleOperator("×")}
          className={`h-10 sm:h-11 rounded-[14px] sm:rounded-2xl active:scale-[0.94] active:opacity-85 text-white font-bold text-lg sm:text-xl flex items-center justify-center transition-all cursor-pointer shadow-xs ${
            currentOp === "×" ? "bg-[#C43B51] ring-2 ring-white/50" : "bg-[#A32A3B] hover:bg-[#B83246]"
          }`}
        >
          ×
        </button>

        {/* ================= ROW 3 ================= */}
        {/* [ 4 ] */}
        <button
          type="button"
          onClick={() => handleNumber("4")}
          className="h-10 sm:h-11 rounded-[14px] sm:rounded-2xl bg-[#FAF0F2] hover:bg-white active:scale-[0.94] active:opacity-85 text-[#5A0E18] font-bold text-base sm:text-lg flex items-center justify-center transition-all cursor-pointer shadow-xs"
        >
          4
        </button>
        {/* [ 5 ] */}
        <button
          type="button"
          onClick={() => handleNumber("5")}
          className="h-10 sm:h-11 rounded-[14px] sm:rounded-2xl bg-[#FAF0F2] hover:bg-white active:scale-[0.94] active:opacity-85 text-[#5A0E18] font-bold text-base sm:text-lg flex items-center justify-center transition-all cursor-pointer shadow-xs"
        >
          5
        </button>
        {/* [ 6 ] */}
        <button
          type="button"
          onClick={() => handleNumber("6")}
          className="h-10 sm:h-11 rounded-[14px] sm:rounded-2xl bg-[#FAF0F2] hover:bg-white active:scale-[0.94] active:opacity-85 text-[#5A0E18] font-bold text-base sm:text-lg flex items-center justify-center transition-all cursor-pointer shadow-xs"
        >
          6
        </button>
        {/* [ - ] */}
        <button
          type="button"
          onClick={() => handleOperator("-")}
          className={`h-10 sm:h-11 rounded-[14px] sm:rounded-2xl active:scale-[0.94] active:opacity-85 text-white font-bold text-lg sm:text-xl flex items-center justify-center transition-all cursor-pointer shadow-xs ${
            currentOp === "-" ? "bg-[#C43B51] ring-2 ring-white/50" : "bg-[#A32A3B] hover:bg-[#B83246]"
          }`}
        >
          -
        </button>

        {/* ================= ROW 4 ================= */}
        {/* [ 1 ] */}
        <button
          type="button"
          onClick={() => handleNumber("1")}
          className="h-10 sm:h-11 rounded-[14px] sm:rounded-2xl bg-[#FAF0F2] hover:bg-white active:scale-[0.94] active:opacity-85 text-[#5A0E18] font-bold text-base sm:text-lg flex items-center justify-center transition-all cursor-pointer shadow-xs"
        >
          1
        </button>
        {/* [ 2 ] */}
        <button
          type="button"
          onClick={() => handleNumber("2")}
          className="h-10 sm:h-11 rounded-[14px] sm:rounded-2xl bg-[#FAF0F2] hover:bg-white active:scale-[0.94] active:opacity-85 text-[#5A0E18] font-bold text-base sm:text-lg flex items-center justify-center transition-all cursor-pointer shadow-xs"
        >
          2
        </button>
        {/* [ 3 ] */}
        <button
          type="button"
          onClick={() => handleNumber("3")}
          className="h-10 sm:h-11 rounded-[14px] sm:rounded-2xl bg-[#FAF0F2] hover:bg-white active:scale-[0.94] active:opacity-85 text-[#5A0E18] font-bold text-base sm:text-lg flex items-center justify-center transition-all cursor-pointer shadow-xs"
        >
          3
        </button>
        {/* [ + ] */}
        <button
          type="button"
          onClick={() => handleOperator("+")}
          className={`h-10 sm:h-11 rounded-[14px] sm:rounded-2xl active:scale-[0.94] active:opacity-85 text-white font-bold text-lg sm:text-xl flex items-center justify-center transition-all cursor-pointer shadow-xs ${
            currentOp === "+" ? "bg-[#C43B51] ring-2 ring-white/50" : "bg-[#A32A3B] hover:bg-[#B83246]"
          }`}
        >
          +
        </button>

        {/* ================= ROW 5 ================= */}
        {/* [ 0 ] */}
        <button
          type="button"
          onClick={() => handleNumber("0")}
          className="h-10 sm:h-11 rounded-[14px] sm:rounded-2xl bg-[#FAF0F2] hover:bg-white active:scale-[0.94] active:opacity-85 text-[#5A0E18] font-bold text-base sm:text-lg flex items-center justify-center transition-all cursor-pointer shadow-xs"
        >
          0
        </button>
        {/* [ . ] */}
        <button
          type="button"
          onClick={handleDecimal}
          className="h-10 sm:h-11 rounded-[14px] sm:rounded-2xl bg-[#FAF0F2] hover:bg-white active:scale-[0.94] active:opacity-85 text-[#5A0E18] font-bold text-base sm:text-lg flex items-center justify-center transition-all cursor-pointer shadow-xs"
        >
          .
        </button>
        {/* [ = ] - Prominent wide button spanning 2 columns as shown in reference layout */}
        <button
          type="button"
          onClick={handleEqual}
          className="col-span-2 h-10 sm:h-11 rounded-[14px] sm:rounded-2xl bg-[#B83246] hover:bg-[#CA3B52] active:scale-[0.96] active:opacity-90 text-white font-bold text-xl flex items-center justify-center transition-all cursor-pointer shadow-md shadow-black/20"
        >
          =
        </button>
      </div>
    </div>
  );
};
