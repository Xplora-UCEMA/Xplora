import type { ReactNode } from 'react';

type Props = {
  title: string;
  copy?: string;
  action?: ReactNode;
  headingLevel?: 2 | 3;
};

/** One calm, actionable state across the account; the original coin stays unchanged. */
export function MemberEmptyState({ title, copy, action, headingLevel = 2 }: Props) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';

  return (
    <div className="ma-empty-state">
      <div className="ma-empty-state__content">
        <Heading className="ma-empty-state__title">{title}</Heading>
        {copy ? <p className="ma-empty-state__copy">{copy}</p> : null}
        {action ? <div className="ma-empty-state__action">{action}</div> : null}
      </div>
    </div>
  );
}
