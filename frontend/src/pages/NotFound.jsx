import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="min-h-screen grad-hero flex items-center justify-center">
      <div className="text-center px-6">
        <div className="num text-8xl font-bold bg-gradient-to-r from-[#6C2BD9] to-[#E23FA0] bg-clip-text text-transparent">404</div>
        <h1 className="mt-4 text-3xl font-bold">Page not found</h1>
        <p className="mt-2 text-[#6B6480]">This page took a wrong turn. Head back home.</p>
        <Link to="/" className="btn-primary mt-6 inline-flex">Go home</Link>
      </div>
    </div>
  );
}
