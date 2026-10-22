export type HelpDocHeaderProps = {
  title: string;
  subtitle: string;
  version?: string;
  metaNote?: string;
  videoUrl?: string;
};

export function HelpDocHeader({
  title,
  subtitle,
  version,
  metaNote,
  videoUrl,
}: HelpDocHeaderProps) {
  return (
    <div className="header">
      <div>
        <div className="header-title">{title}</div>
        <div className="header-sub">{subtitle}</div>
        {videoUrl && (
          <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="header-video"
          >
            Watch video
          </a>
        )}
      </div>
      {(version || metaNote) && (
        <div className="header-meta">
          {version}
          {metaNote && (
            <>
              <br />
              <span style={{ color: "#666" }}>{metaNote}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
