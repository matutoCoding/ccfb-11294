import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  message: string;
}

/** 全局错误边界：避免渲染期异常导致整页白屏 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('界面渲染异常', error, info);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 48, textAlign: 'center', color: '#e8ecf4' }}>
          <h2 style={{ marginBottom: 12 }}>界面出现异常</h2>
          <p style={{ color: '#9aa5ba', fontSize: 13, marginBottom: 20 }}>{this.state.message}</p>
          <button
            className="primary"
            onClick={() => {
              this.setState({ hasError: false, message: '' });
              location.hash = '#/orders';
              location.reload();
            }}
          >
            刷新并回到订单列表
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
