import React from 'react';
import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';

// Shared country-code phone input: flag + searchable country dropdown, defaults
// to India (+91), and emits an E.164 string (or '' when empty).
// Indian numbers are hard-capped at exactly 10 national digits WHILE TYPING:
// react-phone-number-input's `limitMaxLength` keeps React state at 10, and the
// onKeyDown guard stops extra digits from landing in the raw DOM input.
export default function PhoneField({ value, onChange, testid = 'phone-input', autoFocus }) {
  const capIndia = (e) => {
    const el = e.target;
    if (!el || el.tagName !== 'INPUT') return;
    const val = el.value || '';
    const isIndia = val.replace(/\s/g, '').startsWith('+91') || (value || '').startsWith('+91');
    if (!isIndia) return;
    const isDigit = e.key && e.key.length === 1 && /[0-9]/.test(e.key);
    const hasSelection = el.selectionStart !== el.selectionEnd;
    const national = val.replace(/\D/g, '').replace(/^91/, '');
    if (isDigit && !hasSelection && national.length >= 10) {
      e.preventDefault();
    }
  };

  return (
    <div
      data-testid={testid}
      onKeyDown={capIndia}
      className="mt-1.5 flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white h-11 px-3 focus-within:border-[#6C2BD9] focus-within:ring-1 focus-within:ring-[#6C2BD9]
        [&_.PhoneInputInput]:border-0 [&_.PhoneInputInput]:outline-none [&_.PhoneInputInput]:bg-transparent [&_.PhoneInputInput]:h-full [&_.PhoneInputInput]:text-sm [&_.PhoneInputInput]:flex-1
        [&_.PhoneInputCountrySelect]:outline-none [&_.PhoneInputCountryIcon]:shadow-none"
    >
      <PhoneInput
        international
        defaultCountry="IN"
        countryCallingCodeEditable={false}
        limitMaxLength
        value={value}
        onChange={(v) => {
          // The field already shows +91. If someone also types or pastes "+91…" / "91…" / "0…",
          // strip the duplicate so the stored number is exactly their 10 digits.
          let out = v || '';
          const digits = out.replace(/\D/g, '');
          if (digits.startsWith('91') && digits.length > 12) out = `+91${digits.slice(2).replace(/^91/, '').replace(/^0/, '').slice(0, 10)}`;
          else if (digits.startsWith('910') && digits.length === 13) out = `+91${digits.slice(3)}`;
          onChange(out);
        }}
        autoFocus={autoFocus}
        placeholder="Enter mobile number"
      />
    </div>
  );
}
