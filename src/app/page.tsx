import Image from "next/image";
import { BACKGROUND, FOREGROUND, ACCENT } from "../lib/colors";

export default function Home() {
  return (
    <div>
      <Image src="/logo.png" alt="TollRoad Music Logo" width={100} height={100} />
    </div>
  );
}
