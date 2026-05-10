// Registre d'icônes Remix utilisables dans la doc utilisateur.
//
// Le frontmatter des fichiers `docs/documentation/*.md` référence une icône
// par son nom (ex. `icon: RiRocketLine`). Ce fichier est l'unique source de
// vérité de ce qui est disponible — un nom non listé tombe sur un fallback
// `RiQuestionLine`. Les imports nominatifs garantissent que seules les
// icônes utilisées finissent dans le bundle (tree-shaking).
//
// Pour ajouter une icône : importer le composant ici, l'ajouter au map,
// puis référencer le nom dans le frontmatter d'une page.

import {
  RiBookOpenLine,
  RiCloudLine,
  RiFlowChart,
  RiFolderOpenLine,
  RiKey2Line,
  RiPuzzle2Line,
  RiQuestionLine,
  RiRocketLine,
  RiSafe2Line,
  RiShareForward2Line,
  RiTeamLine,
  type RemixiconComponentType,
} from "@remixicon/react";

const ICONS: Record<string, RemixiconComponentType> = {
  RiBookOpenLine,
  RiCloudLine,
  RiFlowChart,
  RiFolderOpenLine,
  RiKey2Line,
  RiPuzzle2Line,
  RiRocketLine,
  RiSafe2Line,
  RiShareForward2Line,
  RiTeamLine,
};

export function DocIcon({
  name,
  size = 18,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const Component = ICONS[name] ?? RiQuestionLine;
  return <Component size={size} className={className} aria-hidden />;
}
