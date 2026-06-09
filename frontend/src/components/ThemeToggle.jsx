import { HiOutlineSun, HiOutlineMoon, HiOutlineComputerDesktop } from 'react-icons/hi2';
import { useTheme } from '../context/ThemeContext.jsx';

const META = {
  light: { Icon: HiOutlineSun, label: 'Light theme' },
  dark: { Icon: HiOutlineMoon, label: 'Dark theme' },
  system: { Icon: HiOutlineComputerDesktop, label: 'System theme' },
};

export default function ThemeToggle({ size = 18, className = '' }) {
  const { theme, toggle } = useTheme();
  const { Icon, label } = META[theme] ?? META.system;

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`}
      onClick={toggle}
      title={`${label} — click to switch`}
      aria-label={`${label}. Click to switch theme.`}
    >
      <Icon size={size} />
    </button>
  );
}
