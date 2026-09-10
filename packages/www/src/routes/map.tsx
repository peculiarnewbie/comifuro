import { createFileRoute } from "@tanstack/solid-router";
import Cf22Map from "../components/map/Cf22Map";

export const Route = createFileRoute("/map")({ component: Cf22Map });
