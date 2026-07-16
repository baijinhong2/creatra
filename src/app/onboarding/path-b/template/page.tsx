import { redirect } from'next/navigation';

// v0.7.1:旧 /onboarding/path-b/template 路径已重命名为 /onboarding/template
export default function OldTemplatePage() {
 redirect('/onboarding/template');
}
