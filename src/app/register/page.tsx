import { redirect } from'next/navigation';

// /login 和 /register 都已合并为 modal,直接重定向到主页(用户与产品交互时弹 modal)
export default function RegisterPage() {
 redirect('/');
}
