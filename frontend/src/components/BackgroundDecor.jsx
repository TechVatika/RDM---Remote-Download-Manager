/** Ambient animated mesh + grid — decorative only. */
export default function BackgroundDecor() {
  return (
    <div className="bg-decor" aria-hidden>
      <div className="bg-grid" />
      <div className="bg-blob bg-blob-a" />
      <div className="bg-blob bg-blob-b" />
      <div className="bg-blob bg-blob-c" />
    </div>
  );
}
