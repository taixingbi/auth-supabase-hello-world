export function Feedback({
  type,
  message,
}: {
  type: "success" | "error";
  message: string;
}) {
  if (!message) return null;
  return (
    <div className={`feedback ${type}`} style={{ whiteSpace: "pre-line" }}>
      {message}
    </div>
  );
}
