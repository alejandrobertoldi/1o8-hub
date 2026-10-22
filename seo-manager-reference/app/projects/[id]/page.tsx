/* eslint-disable react-doctor/nextjs-missing-metadata */
import { redirect } from "next/navigation";

export default function ProjectPage({ params }: { params: { id: string } }) {
  // Redirect to the current active phase
  redirect(`/projects/${params.id}/intake`);
}
