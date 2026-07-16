import { redirect } from'next/navigation';

// 登录已改为 modal。直接访问 /login 时跳到主页(用户与产品交互时会自动弹 modal)。
export default function LoginPage() {
 redirect('/');
}
