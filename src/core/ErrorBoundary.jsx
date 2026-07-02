import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  // Update state so the next render shows the fallback UI
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  // Log error details to the browser console for debugging
  componentDidCatch(error, errorInfo) {
    console.error("[RPG Tracker] React UI Component Crashed:", error, errorInfo);
  }

  // Reset error state to attempt recovery on user click
  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '16px',
          margin: '10px',
          backgroundColor: 'rgba(231, 76, 60, 0.1)',
          border: '1px solid #e74c3c',
          borderRadius: '8px',
          color: '#e74c3c',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          fontFamily: 'inherit',
          pointerEvents: 'auto',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        }}>
          <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 'bold' }}>[Error] RPG Tracker UI Crash</h3>
          <p style={{ margin: 0, fontSize: '11px', opacity: 0.8, lineHeight: '1.4' }}>
            A rendering error occurred in this component.<br/>
            Check the console (F12) for details.
          </p>
          <button
            onClick={this.handleReset}
            style={{
              background: '#e74c3c',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '11px',
              marginTop: '4px',
              alignSelf: 'flex-start'
            }}
          >
            Try to Recover
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}