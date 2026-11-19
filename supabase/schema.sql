create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  type text not null check (type in ('credit', 'debit', 'benefit', 'cash', 'pix')),
  color text not null default '#14b87a',
  closing_day integer,
  due_day integer,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  color text not null default '#64748b',
  icon text not null default 'package',
  budget_limit_monthly numeric(12,2),
  created_at timestamptz not null default now()
);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  store_name text not null,
  store_cnpj text,
  purchase_date timestamptz not null default now(),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  qr_code_url text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  name text not null,
  original_raw_name text not null,
  quantity numeric(12,3) not null default 1,
  unit_price numeric(12,2) not null default 0,
  total_price numeric(12,2) not null default 0,
  category_id uuid references public.categories(id) on delete set null,
  expiration_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  category_id uuid references public.categories(id) on delete cascade,
  month date not null,
  amount numeric(12,2) not null check (amount >= 0),
  unique (user_id, category_id, month)
);

alter table public.profiles enable row level security;
alter table public.payment_methods enable row level security;
alter table public.categories enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_items enable row level security;
alter table public.budgets enable row level security;

create policy "profiles own row" on public.profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "payment methods own rows" on public.payment_methods for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "categories own rows" on public.categories for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "receipts own rows" on public.receipts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "receipt items own rows" on public.receipt_items for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "budgets own rows" on public.budgets for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$ begin insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name', '')); return new; end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
