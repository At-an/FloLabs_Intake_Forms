import type { Metadata } from 'next';
import { LINK_FORM_TYPES } from '@/server/forms/link-tokens';
import { LinkFormPage } from '../_components/LinkFormPage';

export const metadata: Metadata = { title: `${LINK_FORM_TYPES.CONTACTED.label} | FloLabs` };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ t?: string | string[] }> };

export default async function Page({ searchParams }: Props) {
  const { t } = await searchParams;
  return <LinkFormPage token={t} formType="CONTACTED" />;
}
