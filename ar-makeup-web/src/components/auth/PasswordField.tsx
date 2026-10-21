"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";

type PasswordFieldProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
>;

export default function PasswordField({
  className = "",
  id,
  ...rest
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="relative">
      <input
        {...rest}
        id={inputId}
        type={visible ? "text" : "password"}
        className={`${className} pr-12`}
      />
      <button
        type="button"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        aria-controls={inputId}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-1 flex w-10 items-center justify-center rounded-xl text-black/45 transition-colors hover:text-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C06C84]/40"
      >
        {visible ? (
          <EyeOff className="h-[18px] w-[18px]" aria-hidden="true" />
        ) : (
          <Eye className="h-[18px] w-[18px]" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
