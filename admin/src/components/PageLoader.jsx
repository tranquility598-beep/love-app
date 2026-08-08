import { LoaderCircle } from 'lucide-react';

export default function PageLoader({ label = 'Загрузка' }) {
  return (
    <div className="page-loader" role="status">
      <LoaderCircle size={22} className="spin" />
      <span>{label}</span>
    </div>
  );
}
