/**
 * Dell 1996 section eyebrow — chunky display title on a flat color block.
 * @param {object} props
 * @param {string} props.title
 * @param {'olive'|'salmon'|'sage'|'sky'|'periwinkle'|'lime'|'peach'|'steel'} [props.tint]
 * @param {import('react').ReactNode} [props.action]
 */
export default function SectionEyebrow({ title, tint = 'olive', action }) {
  return (
    <div className={`dell-section-eyebrow dell-tint-${tint}`}>
      <h2 className="dell-section-eyebrow-title">{title}</h2>
      {action ? <div className="dell-section-eyebrow-action">{action}</div> : null}
    </div>
  );
}
