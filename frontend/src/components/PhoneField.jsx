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
        onChange={(v) => onChange(v || '')}
        autoFocus={autoFocus}
        placeholder="Enter mobile number"
      />
    </div>
  );
}
