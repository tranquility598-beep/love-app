import { fireEvent, render, screen } from '@testing-library/react';
import { Inbox } from 'lucide-react';
import { expect, test, vi } from 'vitest';
import { EmptyState, Pagination, Segmented } from './ui.jsx';

test('empty state renders its message', () => {
  render(<EmptyState title="Нет обращений" description="Очередь пуста" icon={Inbox} />);
  expect(screen.getByRole('heading', { name: 'Нет обращений' })).toBeInTheDocument();
  expect(screen.getByText('Очередь пуста')).toBeInTheDocument();
});

test('pagination changes pages without exceeding its bounds', () => {
  const onChange = vi.fn();
  render(<Pagination page={2} pages={4} onChange={onChange} />);
  fireEvent.click(screen.getByTitle('Предыдущая страница'));
  fireEvent.click(screen.getByTitle('Следующая страница'));
  expect(onChange).toHaveBeenNthCalledWith(1, 1);
  expect(onChange).toHaveBeenNthCalledWith(2, 3);
});

test('segmented control reports the selected value', () => {
  const onChange = vi.fn();
  render(<Segmented value="all" onChange={onChange} label="Фильтр" options={[{ value: 'all', label: 'Все' }, { value: 'new', label: 'Новые' }]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Новые' }));
  expect(onChange).toHaveBeenCalledWith('new');
});
