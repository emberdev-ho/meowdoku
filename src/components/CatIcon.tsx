// 9 chú mèo thay cho số 1–9. Mỗi con khác cả màu lẫn đặc điểm trên mặt,
// để người không phân biệt được màu vẫn nhận ra.

export const CATS = [
  { name: "Gừng", fill: "#F08A3C", eye: "#23264D" },
  { name: "Than", fill: "#3B3F4A", eye: "#F6E27A" },
  { name: "Tuyết", fill: "#F7F5F0", eye: "#4A7BD0" },
  { name: "Khói", fill: "#9AA1AD", eye: "#23264D" },
  { name: "Ca cao", fill: "#8A5A3B", eye: "#F6E27A" },
  { name: "Đào", fill: "#F2A7B5", eye: "#23264D" },
  { name: "Mây", fill: "#6F8FC9", eye: "#23264D" },
  { name: "Mật", fill: "#E3C04B", eye: "#23264D" },
  { name: "Tím", fill: "#A889D6", eye: "#23264D" },
] as const;

const STROKE = "rgba(35,38,77,0.55)";

function Marks({ value }: { value: number }) {
  switch (value) {
    case 1: // sọc trán
      return (
        <g stroke="#B85A1C" strokeWidth="1.6" strokeLinecap="round">
          <path d="M16.5 12.5v3.5" />
          <path d="M20 11.5v4.5" />
          <path d="M23.5 12.5v3.5" />
        </g>
      );
    case 4: // mảng đậm quanh mắt phải
      return <ellipse cx="25.5" cy="22" rx="4.6" ry="4.2" fill="#6B7280" />;
    case 5: // mõm trắng
      return <ellipse cx="20" cy="29" rx="6" ry="4.2" fill="#F3E6D8" />;
    case 6: // má hồng
      return (
        <g fill="#E8457A" opacity="0.45">
          <circle cx="11" cy="27" r="2.4" />
          <circle cx="29" cy="27" r="2.4" />
        </g>
      );
    case 8: // đốm trán
      return <circle cx="20" cy="14.5" r="2.6" fill="#B8902A" />;
    case 9: // tim nhỏ trên má
      return <path d="M28.6 28.2c-.9-1.4-3-.8-2.6.9.3 1.2 2.6 2.7 2.6 2.7s2.3-1.5 2.6-2.7c.4-1.7-1.7-2.3-2.6-.9z" fill="#FFFFFF" opacity="0.85" />;
    default:
      return null;
  }
}

export function CatIcon({ value, className, label }: { value: number; className?: string; label?: string }) {
  const cat = CATS[value - 1];
  if (!cat) return null;
  const sleepy = value === 7;
  return (
    <svg viewBox="0 0 40 40" className={className} role="img" aria-label={label ?? `Mèo ${cat.name} (${value})`}>
      <path d="M6.5 18 9 3.5 18.5 11z" fill={cat.fill} stroke={STROKE} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M33.5 18 31 3.5 21.5 11z" fill={cat.fill} stroke={STROKE} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M10 12.5 10.8 7l4 3.6z" fill="#F7B3C2" opacity="0.8" />
      <path d="M30 12.5 29.2 7l-4 3.6z" fill="#F7B3C2" opacity="0.8" />
      <ellipse cx="20" cy="23" rx="15" ry="13" fill={cat.fill} stroke={STROKE} strokeWidth="1.4" />
      <Marks value={value} />
      {sleepy ? (
        <g stroke="#23264D" strokeWidth="1.8" fill="none" strokeLinecap="round">
          <path d="M12 22.5q2.5 2.4 5 0" />
          <path d="M23 22.5q2.5 2.4 5 0" />
        </g>
      ) : (
        <g fill={cat.eye}>
          <ellipse cx="14.5" cy="22" rx="2.1" ry="2.7" />
          <ellipse cx="25.5" cy="22" rx="2.1" ry="2.7" />
        </g>
      )}
      <path d="M18.4 27h3.2L20 29z" fill="#E8457A" />
      <path d="M20 29v1.2M20 30.2q-1.6 1.6-3.2.4M20 30.2q1.6 1.6 3.2.4" stroke="#23264D" strokeWidth="1" fill="none" strokeLinecap="round" />
    </svg>
  );
}
