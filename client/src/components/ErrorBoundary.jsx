import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: '2rem',
          color: '#e0e0e0',
          fontFamily: 'Montserrat, sans-serif'
        }}>
          <h2 style={{ color: '#4db8a8', marginBottom: '0.5rem' }}>Something went wrong</h2>
          <p style={{ color: '#808080', marginBottom: '1.5rem' }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              background: '#4db8a8',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '0.5rem 1.5rem',
              cursor: 'pointer',
              fontFamily: 'inherit'
            }}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
