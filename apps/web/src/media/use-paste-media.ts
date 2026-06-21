import { useEffect } from "react";
import { useEditor } from "@/editor/use-editor";
import { toast } from "sonner";
import { isTypableDOMElement } from "@/utils/browser";

export function usePasteMedia() {
	const editor = useEditor();

	useEffect(() => {
		const handlePaste = async (event: ClipboardEvent) => {
			const activeElement = document.activeElement as HTMLElement;

			if (activeElement && isTypableDOMElement({ element: activeElement })) {
				return;
			}
			event.preventDefault();
			editor.clipboard.paste();
			toast.info("Use the media library panel to import files into a project.");
		};

		window.addEventListener("paste", handlePaste);
		return () => window.removeEventListener("paste", handlePaste);
	}, [editor]);
}
